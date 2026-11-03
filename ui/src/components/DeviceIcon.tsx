import { Cloud, Computer, Laptop, Monitor, PcCase, Server, Terminal } from 'lucide-react';
import { MonitorModel } from '../model/monitorModel';

const icons = { computer: Monitor, desktop: Monitor, laptop: Laptop, mini: PcCase,
  workstation: Computer, server: Server, cloud: Cloud, linux: Terminal };

export function DeviceIcon({ kind, className = 'w-4 h-4' }: { kind?: string; className?: string }) {
  const normalized = MonitorModel.deviceKind(kind);
  const Icon = icons[normalized as keyof typeof icons];
  return <Icon className={className} aria-hidden="true" data-device-kind={normalized} />;
}
