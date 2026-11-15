import { ChannelTabs } from "@/app/components/ui/channel-tabs";

// "Canales" es una sola entrada del menú: cada canal comparte estas pestañas.
export default function ChannelAccountsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ChannelTabs />
      {children}
    </>
  );
}
