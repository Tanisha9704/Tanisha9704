import { ConnectButton } from '@rainbow-me/rainbowkit';
import toast from 'react-hot-toast';
import { useMultiWallet } from '../../hooks/useMultiWallet';

export function WalletConnect() {
  const { jwt, signIn, signOut, address } = useMultiWallet();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openChainModal, openConnectModal, mounted }) => {
        if (!mounted) return null;
        const evmConnected = !!account && !!chain;

        if (!evmConnected) {
          return (
            <button onClick={openConnectModal} className="btn-primary">
              Connect Wallet
            </button>
          );
        }
        if (!jwt) {
          return (
            <button
              onClick={async () => {
                try {
                  await signIn();
                  toast.success('Signed in');
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
              className="btn-primary"
            >
              Sign in
            </button>
          );
        }
        return (
          <div className="flex items-center gap-2">
            <button onClick={openChainModal} className="btn-ghost">
              {chain.name}
            </button>
            <span className="font-mono text-sm">{shorten(address ?? account.address)}</span>
            <button onClick={signOut} className="btn-ghost">
              Sign out
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

function shorten(a?: string | null): string {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
