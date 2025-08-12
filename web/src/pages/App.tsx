import { Link, Route, Routes } from 'react-router-dom';
import Dashboard from './Dashboard.tsx';
import Clients from './Clients.tsx';
import Audits from './Audits.tsx';

export default function App() {
  return (
    <div className="min-h-screen grid grid-cols-[16rem_1fr]">
      <aside className="bg-white border-r p-4 space-y-2">
        <h1 className="text-xl font-semibold">FlowLedger</h1>
        <nav className="flex flex-col gap-1">
          <Link to="/">Dashboard</Link>
          <Link to="/clients">Clients</Link>
          <Link to="/audits">Audits</Link>
        </nav>
      </aside>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/audits" element={<Audits />} />
        </Routes>
      </main>
    </div>
  );
}
