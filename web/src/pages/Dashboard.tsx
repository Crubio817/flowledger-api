import { useEffect, useState } from 'react';
import { api, ApiResponse } from '../lib/api';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    api.get<ApiResponse<any>>('/views/dashboard-stats').then((r) => setStats(r.data.data));
    api.get<ApiResponse<{ items: any[] }>>('/views/audit-recent-touch?limit=5').then((r) => setRecent(r.data.data.items));
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Dashboard</h2>
      {stats && (
        <div className="grid grid-cols-2 gap-4">
          <Card title="Active Clients" value={stats.active_clients} />
          <Card title="Audits In Progress" value={stats.audits_in_progress} />
          <Card title="SIPOCs Completed" value={stats.sipocs_completed} />
          <Card title="Pending Interviews" value={stats.pending_interviews} />
        </div>
      )}

      <div>
        <h3 className="text-xl mb-2">Recent Audits</h3>
        <table className="min-w-full bg-white border">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2">Audit</th>
              <th className="p-2">Client</th>
              <th className="p-2">Status</th>
              <th className="p-2">Last Touched (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{r.title}</td>
                <td className="p-2">{r.client_id}</td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">{r.last_touched_utc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: any }) {
  return (
    <div className="bg-white border rounded p-4">
      <div className="text-sm text-gray-600">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
