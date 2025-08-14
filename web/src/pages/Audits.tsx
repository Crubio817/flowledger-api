import { useEffect, useState } from 'react';
import { getPath } from '../lib/api';

export default function Audits() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
  const r = await getPath('/api/audits', { limit: 20 });
  // r matches success envelope with optional data property
  setItems(((r as any).data ?? []) as any[]);
    })();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Audits</h2>
      <table className="min-w-full bg-white border">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2">Audit ID</th>
            <th className="p-2">Client ID</th>
            <th className="p-2">Title</th>
            <th className="p-2">Status</th>
            <th className="p-2">Updated (UTC)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.audit_id} className="border-t">
              <td className="p-2">{a.audit_id}</td>
              <td className="p-2">{a.client_id}</td>
              <td className="p-2">{a.title}</td>
              <td className="p-2">{a.status}</td>
              <td className="p-2">{a.updated_utc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
