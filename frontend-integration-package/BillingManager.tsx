import React, { useState, useEffect } from 'react';
import { BillingApi, Contract, TimeEntry, Invoice, Payment, ContractMilestone } from './billing-api';

interface BillingManagerProps {
  orgId: number;
  api?: BillingApi;
}

export function BillingManager({ orgId, api = new BillingApi() }: BillingManagerProps) {
  const [activeTab, setActiveTab] = useState<'contracts' | 'time-entries' | 'invoices' | 'payments'>('contracts');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    loadData();
  }, [orgId, activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      switch (activeTab) {
        case 'contracts':
          const contractsResult = await api.getContracts({ org_id: orgId });
          setContracts(contractsResult.data || []);
          break;
        case 'time-entries':
          const timeEntriesResult = await api.getTimeEntries({ org_id: orgId });
          setTimeEntries(timeEntriesResult.data || []);
          break;
        case 'invoices':
          const invoicesResult = await api.getInvoices({ org_id: orgId });
          setInvoices(invoicesResult.data || []);
          break;
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContract = async (data: any) => {
    try {
      await api.createContract({ ...data, org_id: orgId });
      setShowCreateForm(false);
      loadData();
    } catch (error) {
      console.error('Failed to create contract:', error);
    }
  };

  const handleUpdateContractStatus = async (contractId: number, status: string) => {
    try {
      await api.updateContractStatus(contractId, status, orgId);
      loadData();
    } catch (error) {
      console.error('Failed to update contract status:', error);
    }
  };

  const handleApproveTimeEntry = async (timeEntryId: number) => {
    try {
      await api.approveTimeEntry(timeEntryId, orgId);
      loadData();
    } catch (error) {
      console.error('Failed to approve time entry:', error);
    }
  };

  const handleUpdateInvoiceStatus = async (invoiceId: number, status: string) => {
    try {
      await api.updateInvoiceStatus(invoiceId, status, orgId);
      loadData();
    } catch (error) {
      console.error('Failed to update invoice status:', error);
    }
  };

  if (loading) {
    return <div className="p-4">Loading billing data...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Billing & Contracts</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          New Contract
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-4 border-b mb-4">
        <button
          onClick={() => setActiveTab('contracts')}
          className={`px-4 py-2 ${activeTab === 'contracts' ? 'border-b-2 border-blue-500' : ''}`}
        >
          Contracts
        </button>
        <button
          onClick={() => setActiveTab('time-entries')}
          className={`px-4 py-2 ${activeTab === 'time-entries' ? 'border-b-2 border-blue-500' : ''}`}
        >
          Time Entries
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2 ${activeTab === 'invoices' ? 'border-b-2 border-blue-500' : ''}`}
        >
          Invoices
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 ${activeTab === 'payments' ? 'border-b-2 border-blue-500' : ''}`}
        >
          Payments
        </button>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'contracts' && (
          <ContractsTab
            contracts={contracts}
            onUpdateStatus={handleUpdateContractStatus}
            onViewDetails={setSelectedContract}
          />
        )}
        {activeTab === 'time-entries' && (
          <TimeEntriesTab
            timeEntries={timeEntries}
            onApprove={handleApproveTimeEntry}
          />
        )}
        {activeTab === 'invoices' && (
          <InvoicesTab
            invoices={invoices}
            onUpdateStatus={handleUpdateInvoiceStatus}
          />
        )}
        {activeTab === 'payments' && (
          <PaymentsTab orgId={orgId} api={api} />
        )}
      </div>

      {showCreateForm && (
        <CreateContractForm
          onSubmit={handleCreateContract}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {selectedContract && (
        <ContractDetails
          contract={selectedContract}
          orgId={orgId}
          api={api}
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  );
}

// Contracts Tab Component
interface ContractsTabProps {
  contracts: Contract[];
  onUpdateStatus: (id: number, status: string) => void;
  onViewDetails: (contract: Contract) => void;
}

function ContractsTab({ contracts, onUpdateStatus, onViewDetails }: ContractsTabProps) {
  return (
    <div className="grid gap-4">
      {contracts.map((contract) => (
        <div key={contract.id} className="border rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold">{contract.contract_type.replace('_', ' ').toUpperCase()}</h3>
              <p className="text-gray-600">{contract.client_name}</p>
              {contract.engagement_name && (
                <p className="text-sm text-gray-500">Engagement: {contract.engagement_name}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-1 rounded text-sm ${
                  contract.status === 'active' ? 'bg-green-100 text-green-800' :
                  contract.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {contract.status}
                </span>
                <span className="text-sm text-gray-600">
                  {contract.currency} {contract.total_amount?.toLocaleString()}
                </span>
                {contract.current_spend !== undefined && (
                  <span className="text-sm text-gray-600">
                    Spent: {contract.currency} {contract.current_spend.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={contract.status}
                onChange={(e) => onUpdateStatus(contract.id, e.target.value)}
                className="border rounded px-2 py-1"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="terminated">Terminated</option>
              </select>
              <button
                onClick={() => onViewDetails(contract)}
                className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
              >
                View Details
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Time Entries Tab Component
interface TimeEntriesTabProps {
  timeEntries: TimeEntry[];
  onApprove: (id: number) => void;
}

function TimeEntriesTab({ timeEntries, onApprove }: TimeEntriesTabProps) {
  return (
    <div className="grid gap-4">
      {timeEntries.map((entry) => (
        <div key={entry.id} className="border rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold">{entry.person_name} - {entry.role_name}</h3>
              <p className="text-gray-600">{entry.description}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-gray-600">
                  {entry.hours} hours on {new Date(entry.entry_date).toLocaleDateString()}
                </span>
                <span className="text-sm text-gray-600">
                  Rate: {entry.currency_snapshot} {entry.bill_rate_snapshot}/hr
                </span>
                <span className={`px-2 py-1 rounded text-sm ${
                  entry.approved_at ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {entry.approved_at ? 'Approved' : 'Pending'}
                </span>
              </div>
            </div>
            {!entry.approved_at && (
              <button
                onClick={() => onApprove(entry.id)}
                className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
              >
                Approve
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Invoices Tab Component
interface InvoicesTabProps {
  invoices: Invoice[];
  onUpdateStatus: (id: number, status: string) => void;
}

function InvoicesTab({ invoices, onUpdateStatus }: InvoicesTabProps) {
  return (
    <div className="grid gap-4">
      {invoices.map((invoice) => (
        <div key={invoice.id} className="border rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold">{invoice.invoice_number}</h3>
              <p className="text-gray-600">{invoice.client_name}</p>
              {invoice.engagement_name && (
                <p className="text-sm text-gray-500">Engagement: {invoice.engagement_name}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-1 rounded text-sm ${
                  invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                  invoice.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                  invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {invoice.status}
                </span>
                <span className="text-sm text-gray-600">
                  {invoice.currency} {invoice.total_amount.toLocaleString()}
                </span>
                <span className="text-sm text-gray-600">
                  Outstanding: {invoice.currency} {invoice.outstanding_amount.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={invoice.status}
                onChange={(e) => onUpdateStatus(invoice.id, e.target.value)}
                className="border rounded px-2 py-1"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="viewed">Viewed</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="voided">Voided</option>
              </select>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Payments Tab Component
interface PaymentsTabProps {
  orgId: number;
  api: BillingApi;
}

function PaymentsTab({ orgId, api }: PaymentsTabProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    // Note: This would need a getPayments method in the API
    // For now, we'll show a placeholder
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Payments</h3>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
        >
          Record Payment
        </button>
      </div>
      <div className="text-center text-gray-500 py-8">
        Payments management coming soon...
      </div>
      {showCreateForm && (
        <CreatePaymentForm
          orgId={orgId}
          api={api}
          onSubmit={() => {
            setShowCreateForm(false);
            loadPayments();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}
    </div>
  );
}

// Form Components
interface CreateContractFormProps {
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

function CreateContractForm({ onSubmit, onCancel }: CreateContractFormProps) {
  const [formData, setFormData] = useState({
    client_id: '',
    engagement_id: '',
    contract_type: 'time_materials',
    currency: 'USD',
    start_date: '',
    end_date: '',
    retainer_amount: '',
    included_hours: '',
    budget_cap: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      client_id: Number(formData.client_id),
      engagement_id: formData.engagement_id ? Number(formData.engagement_id) : undefined,
      retainer_amount: formData.retainer_amount ? Number(formData.retainer_amount) : undefined,
      included_hours: formData.included_hours ? Number(formData.included_hours) : undefined,
      budget_cap: formData.budget_cap ? Number(formData.budget_cap) : undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">Create New Contract</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Contract Type</label>
            <select
              value={formData.contract_type}
              onChange={(e) => setFormData({...formData, contract_type: e.target.value})}
              className="w-full border rounded px-3 py-2"
              required
            >
              <option value="time_materials">Time & Materials</option>
              <option value="fixed_price">Fixed Price</option>
              <option value="milestone">Milestone</option>
              <option value="retainer">Retainer</option>
              <option value="prepaid">Prepaid</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Client ID</label>
            <input
              type="number"
              value={formData.client_id}
              onChange={(e) => setFormData({...formData, client_id: e.target.value})}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Engagement ID (Optional)</label>
            <input
              type="number"
              value={formData.engagement_id}
              onChange={(e) => setFormData({...formData, engagement_id: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({...formData, currency: e.target.value})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({...formData, start_date: e.target.value})}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({...formData, end_date: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Create
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CreatePaymentFormProps {
  orgId: number;
  api: BillingApi;
  onSubmit: () => void;
  onCancel: () => void;
}

function CreatePaymentForm({ orgId, api, onSubmit, onCancel }: CreatePaymentFormProps) {
  const [formData, setFormData] = useState({
    invoice_id: '',
    amount: '',
    currency: 'USD',
    payment_method: 'wire',
    payment_date: '',
    reference_number: '',
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    api.createPayment({
      ...formData,
      org_id: orgId,
      invoice_id: Number(formData.invoice_id),
      amount: Number(formData.amount)
    }).then(() => {
      onSubmit();
    }).catch((error) => {
      console.error('Failed to create payment:', error);
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">Record Payment</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Invoice ID</label>
            <input
              type="number"
              value={formData.invoice_id}
              onChange={(e) => setFormData({...formData, invoice_id: e.target.value})}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: e.target.value})}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({...formData, currency: e.target.value})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payment Method</label>
            <select
              value={formData.payment_method}
              onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="wire">Wire Transfer</option>
              <option value="check">Check</option>
              <option value="credit_card">Credit Card</option>
              <option value="ach">ACH</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payment Date</label>
            <input
              type="date"
              value={formData.payment_date}
              onChange={(e) => setFormData({...formData, payment_date: e.target.value})}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              Record Payment
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ContractDetailsProps {
  contract: Contract;
  orgId: number;
  api: BillingApi;
  onClose: () => void;
}

function ContractDetails({ contract, orgId, api, onClose }: ContractDetailsProps) {
  const [activeTab, setActiveTab] = useState<'milestones' | 'invoices' | 'time-entries'>('milestones');
  const [milestones, setMilestones] = useState<ContractMilestone[]>([]);

  useEffect(() => {
    if (activeTab === 'milestones') {
      loadMilestones();
    }
  }, [activeTab]);

  const loadMilestones = async () => {
    try {
      const result = await api.getContractMilestones(contract.id, { org_id: orgId });
      setMilestones(result.data || []);
    } catch (error) {
      console.error('Failed to load milestones:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">{contract.contract_type.replace('_', ' ').toUpperCase()} Contract</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <div className="flex gap-4 border-b">
            <button
              onClick={() => setActiveTab('milestones')}
              className={`px-4 py-2 ${activeTab === 'milestones' ? 'border-b-2 border-blue-500' : ''}`}
            >
              Milestones
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-4 py-2 ${activeTab === 'invoices' ? 'border-b-2 border-blue-500' : ''}`}
            >
              Invoices
            </button>
            <button
              onClick={() => setActiveTab('time-entries')}
              className={`px-4 py-2 ${activeTab === 'time-entries' ? 'border-b-2 border-blue-500' : ''}`}
            >
              Time Entries
            </button>
          </div>
        </div>

        <div className="min-h-[300px]">
          {activeTab === 'milestones' && <MilestonesTab milestones={milestones} />}
          {activeTab === 'invoices' && <div className="p-4 text-center text-gray-500">Invoices management coming soon...</div>}
          {activeTab === 'time-entries' && <div className="p-4 text-center text-gray-500">Time entries management coming soon...</div>}
        </div>
      </div>
    </div>
  );
}

function MilestonesTab({ milestones }: { milestones: ContractMilestone[] }) {
  return (
    <div className="space-y-4">
      {milestones.map((milestone) => (
        <div key={milestone.id} className="border rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold">{milestone.name}</h4>
              {milestone.description && (
                <p className="text-gray-600 text-sm">{milestone.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-gray-600">
                  Amount: ${milestone.amount.toLocaleString()}
                </span>
                <span className="text-sm text-gray-600">
                  Due: {new Date(milestone.due_date).toLocaleDateString()}
                </span>
                <span className={`px-2 py-1 rounded text-sm ${
                  milestone.status === 'completed' ? 'bg-green-100 text-green-800' :
                  milestone.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {milestone.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
      {milestones.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          No milestones found for this contract.
        </div>
      )}
    </div>
  );
}
