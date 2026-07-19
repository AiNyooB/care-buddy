import { CountdownSection } from './CountdownSection';
import { HealthMetricsSection } from './HealthMetricsSection';

export function Dashboard() {
  return (
    <div className="flex h-full flex-col gap-4">
      <HealthMetricsSection />
      <CountdownSection />
    </div>
  );
}
