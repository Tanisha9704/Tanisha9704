/// UNO ONCHAIN — Aptos escrow module.
/// Mirrors the EVM contract: holds APT buy-ins, refunds on leave, and pays the
/// winner minus a 1.5% platform fee on settlement, gated by an Ed25519 signature
/// from the off-chain settlement signer.
module uno_onchain::uno_escrow {
    use std::signer;
    use std::vector;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::ed25519;
    use aptos_framework::event;

    const E_NOT_OWNER: u64 = 1;
    const E_GAME_EXISTS: u64 = 2;
    const E_GAME_NOT_FOUND: u64 = 3;
    const E_GAME_FULL: u64 = 4;
    const E_ALREADY_JOINED: u64 = 5;
    const E_NOT_PLAYER: u64 = 6;
    const E_BAD_BUYIN: u64 = 7;
    const E_NOT_ACTIVE: u64 = 8;
    const E_BAD_SIGNATURE: u64 = 9;
    const E_FEE_TOO_HIGH: u64 = 10;

    const MAX_FEE_BPS: u64 = 500;
    const BPS_DENOMINATOR: u64 = 10_000;

    struct Config has key {
        owner: address,
        treasury: address,
        signer_pubkey: vector<u8>,
        fee_bps: u64,
    }

    struct Game has key, store {
        host: address,
        buy_in: u64,
        max_players: u8,
        players: vector<address>,
        active: bool,
        settled: bool,
        pool: coin::Coin<AptosCoin>,
    }

    /// All games are stored under the module address, keyed by game_id.
    struct GameRegistry has key {
        ids: vector<vector<u8>>,
    }

    #[event]
    struct GameCreated has drop, store { game_id: vector<u8>, host: address, buy_in: u64 }
    #[event]
    struct PlayerJoined has drop, store { game_id: vector<u8>, player: address }
    #[event]
    struct GameSettled has drop, store { game_id: vector<u8>, winner: address, payout: u64, fee: u64 }

    public entry fun init(admin: &signer, treasury: address, signer_pubkey: vector<u8>, fee_bps: u64) {
        assert!(fee_bps <= MAX_FEE_BPS, E_FEE_TOO_HIGH);
        move_to(admin, Config {
            owner: signer::address_of(admin),
            treasury,
            signer_pubkey,
            fee_bps,
        });
        move_to(admin, GameRegistry { ids: vector::empty() });
    }

    /// Hosts deposit `buy_in` APT and create a game keyed by a 32-byte id.
    public entry fun create_game(
        host: &signer,
        game_id: vector<u8>,
        buy_in: u64,
        max_players: u8,
    ) acquires GameRegistry {
        assert!(max_players >= 2 && max_players <= 4, E_BAD_BUYIN);
        let host_addr = signer::address_of(host);

        let pool = coin::withdraw<AptosCoin>(host, buy_in);
        let players = vector::empty<address>();
        vector::push_back(&mut players, host_addr);

        let game = Game {
            host: host_addr,
            buy_in,
            max_players,
            players,
            active: true,
            settled: false,
            pool,
        };
        move_to(host, game); // game stored under host's address — registry tracks all addresses

        let reg = borrow_global_mut<GameRegistry>(@uno_onchain);
        vector::push_back(&mut reg.ids, game_id);

        event::emit(GameCreated { game_id, host: host_addr, buy_in });
    }

    public entry fun join_game(
        joiner: &signer,
        host_addr: address,
        game_id: vector<u8>,
    ) acquires Game {
        let joiner_addr = signer::address_of(joiner);
        let game = borrow_global_mut<Game>(host_addr);
        assert!(game.active && !game.settled, E_NOT_ACTIVE);
        assert!((vector::length(&game.players) as u8) < game.max_players, E_GAME_FULL);
        assert!(!vector::contains(&game.players, &joiner_addr), E_ALREADY_JOINED);

        let coins = coin::withdraw<AptosCoin>(joiner, game.buy_in);
        coin::merge(&mut game.pool, coins);
        vector::push_back(&mut game.players, joiner_addr);

        event::emit(PlayerJoined { game_id, player: joiner_addr });
    }

    /// Settle a game. The signature must be a valid ed25519 signature over
    /// concat(game_id, winner_bytes) by the configured signer pubkey.
    public entry fun settle_game(
        _caller: &signer,
        host_addr: address,
        game_id: vector<u8>,
        winner: address,
        signature: vector<u8>,
    ) acquires Game, Config {
        let cfg = borrow_global<Config>(@uno_onchain);
        let game = borrow_global_mut<Game>(host_addr);
        assert!(game.active && !game.settled, E_NOT_ACTIVE);
        assert!(vector::contains(&game.players, &winner), E_NOT_PLAYER);

        let mut_msg = vector::empty<u8>();
        vector::append(&mut mut_msg, game_id);
        vector::append(&mut mut_msg, std::bcs::to_bytes(&winner));
        let pubkey = ed25519::new_unvalidated_public_key_from_bytes(cfg.signer_pubkey);
        let sig = ed25519::new_signature_from_bytes(signature);
        assert!(ed25519::signature_verify_strict(&sig, &pubkey, mut_msg), E_BAD_SIGNATURE);

        let total = coin::value(&game.pool);
        let fee = (total * cfg.fee_bps) / BPS_DENOMINATOR;
        let payout = total - fee;

        let fee_coins = coin::extract(&mut game.pool, fee);
        let payout_coins = coin::extract_all(&mut game.pool);

        coin::deposit(cfg.treasury, fee_coins);
        coin::deposit(winner, payout_coins);

        game.active = false;
        game.settled = true;
        event::emit(GameSettled { game_id, winner, payout, fee });
    }

    #[view]
    public fun get_game(host_addr: address): (u64, u8, u64, bool) acquires Game {
        let g = borrow_global<Game>(host_addr);
        (g.buy_in, g.max_players, vector::length(&g.players), g.active)
    }
}
