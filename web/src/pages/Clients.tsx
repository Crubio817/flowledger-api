import { useEffect, useState } from 'react';
import { getClients } from '../lib/api';

export default function Clients() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const list = await getClients(20);
      setItems(list);
    })();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Clients</h2>
      <table className="min-w-full bg-white border">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2">ID</th>
            <th className="p-2">Name</th>
            <th className="p-2">Active</th>
            <th className="p-2">Created (UTC)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.client_id} className="border-t">
              <td className="p-2">{c.client_id}</td>
              <td className="p-2">{c.name}</td>
              <td className="p-2">{c.is_active ? 'Yes' : 'No'}</td>
              <td className="p-2">{c.created_utc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
