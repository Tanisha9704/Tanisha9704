// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title UnoEscrow
 * @notice Holds player buy-ins for UNO ONCHAIN matches and pays out the winner
 *         minus a platform fee on settlement.
 *
 * Trust model:
 *   - The contract owner controls the platform fee (capped at 5%) and the
 *     settlement signing key. The signer must produce an EIP-191 signature over
 *     keccak256(abi.encodePacked(gameId, winner)) for `settleGame` to succeed.
 *   - Players deposit ETH at game creation and join. They can leave (and recover
 *     their deposit) any time before the game is settled. If the host leaves,
 *     all remaining players are refunded and the game is cancelled.
 *
 * Deliberately omitted to keep the bytecode small:
 *   - ERC-20 buy-ins (planned: a parallel `UnoEscrowToken` for USDC pools).
 *   - Multi-round tournaments.
 */

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

contract UnoEscrow is Ownable, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    uint256 public constant MAX_FEE_BPS = 500; // 5% hard cap
    uint256 public constant BPS_DENOMINATOR = 10_000;

    uint256 public platformFeeBps;
    address public treasury;
    /// @notice Address whose signature is required to settle games. Stored
    ///         separately from `owner` so the cold settlement key can rotate
    ///         without changing the contract admin.
    address public settlementSigner;

    struct Game {
        address host;
        uint256 buyIn;
        uint8 maxPlayers;
        bool active;
        bool settled;
        address[] players;
        mapping(address => bool) hasDeposited;
    }

    mapping(bytes32 => Game) private _games;

    event GameCreated(bytes32 indexed gameId, address indexed host, uint256 buyIn, uint8 maxPlayers);
    event PlayerJoined(bytes32 indexed gameId, address indexed player);
    event PlayerLeft(bytes32 indexed gameId, address indexed player, uint256 refund);
    event GameCancelled(bytes32 indexed gameId);
    event GameSettled(bytes32 indexed gameId, address indexed winner, uint256 payout, uint256 fee);
    event FeeUpdated(uint256 newFeeBps);
    event TreasuryUpdated(address newTreasury);
    event SignerUpdated(address newSigner);

    constructor(uint256 _feeBps, address _treasury, address _signer) Ownable(msg.sender) {
        require(_feeBps <= MAX_FEE_BPS, "fee too high");
        require(_treasury != address(0), "treasury required");
        require(_signer != address(0), "signer required");
        platformFeeBps = _feeBps;
        treasury = _treasury;
        settlementSigner = _signer;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    function setFeeBps(uint256 newFee) external onlyOwner {
        require(newFee <= MAX_FEE_BPS, "fee too high");
        platformFeeBps = newFee;
        emit FeeUpdated(newFee);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "treasury required");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setSettlementSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "signer required");
        settlementSigner = newSigner;
        emit SignerUpdated(newSigner);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // -------------------------------------------------------------------------
    // Game lifecycle
    // -------------------------------------------------------------------------

    function createGame(bytes32 gameId, uint8 maxPlayers) external payable whenNotPaused {
        require(msg.value > 0, "buy-in required");
        require(maxPlayers >= 2 && maxPlayers <= 4, "2-4 players");
        Game storage game = _games[gameId];
        require(!game.active && !game.settled, "game exists");

        game.host = msg.sender;
        game.buyIn = msg.value;
        game.maxPlayers = maxPlayers;
        game.active = true;
        game.players.push(msg.sender);
        game.hasDeposited[msg.sender] = true;

        emit GameCreated(gameId, msg.sender, msg.value, maxPlayers);
    }

    function joinGame(bytes32 gameId) external payable whenNotPaused {
        Game storage game = _games[gameId];
        require(game.active && !game.settled, "game not joinable");
        require(msg.value == game.buyIn, "wrong buy-in");
        require(game.players.length < game.maxPlayers, "full");
        require(!game.hasDeposited[msg.sender], "already joined");

        game.players.push(msg.sender);
        game.hasDeposited[msg.sender] = true;
        emit PlayerJoined(gameId, msg.sender);
    }

    /**
     * @notice Leave a game before settlement. If the host leaves, the game is
     *         cancelled and all remaining players are refunded. The host's
     *         deposit is also refunded as part of the cancellation flow.
     */
    function leaveBeforeStart(bytes32 gameId) external nonReentrant {
        Game storage game = _games[gameId];
        require(game.active && !game.settled, "invalid state");
        require(game.hasDeposited[msg.sender], "not in game");

        if (msg.sender == game.host) {
            // Cancel the entire game; refund every depositor.
            address[] memory players = game.players;
            uint256 buyIn = game.buyIn;
            game.active = false;
            // Clear deposits before the loop so reentrancy can't double-spend.
            for (uint256 i = 0; i < players.length; i++) {
                address p = players[i];
                if (game.hasDeposited[p]) {
                    game.hasDeposited[p] = false;
                    _safeTransferEth(payable(p), buyIn);
                }
            }
            emit GameCancelled(gameId);
        } else {
            // Single-player leave.
            game.hasDeposited[msg.sender] = false;
            _removeFromArray(game.players, msg.sender);
            _safeTransferEth(payable(msg.sender), game.buyIn);
            emit PlayerLeft(gameId, msg.sender, game.buyIn);
        }
    }

    /**
     * @notice Settle a game. The signer endorses (gameId, winner) off-chain.
     *         Total pool is split: (1 - feeBps) to winner, feeBps to treasury.
     */
    function settleGame(
        bytes32 gameId,
        address winner,
        bytes calldata serverSignature
    ) external nonReentrant whenNotPaused {
        Game storage game = _games[gameId];
        require(game.active && !game.settled, "invalid state");
        require(game.hasDeposited[winner], "winner not a player");

        bytes32 payloadHash = keccak256(abi.encodePacked(gameId, winner));
        address recovered = payloadHash.toEthSignedMessageHash().recover(serverSignature);
        require(recovered == settlementSigner, "bad signature");

        uint256 totalPool = game.buyIn * game.players.length;
        uint256 fee = (totalPool * platformFeeBps) / BPS_DENOMINATOR;
        uint256 payout = totalPool - fee;

        game.settled = true;
        game.active = false;

        if (fee > 0) _safeTransferEth(payable(treasury), fee);
        _safeTransferEth(payable(winner), payout);

        emit GameSettled(gameId, winner, payout, fee);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function getGame(bytes32 gameId)
        external
        view
        returns (
            address host,
            uint256 buyIn,
            uint8 maxPlayers,
            uint256 currentPlayers,
            bool active,
            bool settled
        )
    {
        Game storage g = _games[gameId];
        return (g.host, g.buyIn, g.maxPlayers, g.players.length, g.active, g.settled);
    }

    function getPlayers(bytes32 gameId) external view returns (address[] memory) {
        return _games[gameId].players;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _safeTransferEth(address payable to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "eth transfer failed");
    }

    function _removeFromArray(address[] storage arr, address target) private {
        uint256 len = arr.length;
        for (uint256 i = 0; i < len; i++) {
            if (arr[i] == target) {
                arr[i] = arr[len - 1];
                arr.pop();
                return;
            }
        }
    }
}
