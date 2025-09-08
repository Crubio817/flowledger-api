import React, { useState, useEffect } from 'react';
import { EngagementsApi, Engagement, Feature, Milestone, ChangeRequest } from './engagements-api';

interface EngagementsManagerProps {
  orgId: number;
  api?: EngagementsApi;
}

export function EngagementsManager({ orgId, api = new EngagementsApi() }: EngagementsManagerProps) {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEngagement, setSelectedEngagement] = useState<Engagement | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    loadEngagements();
  }, [orgId]);

  const loadEngagements = async () => {
    try {
      setLoading(true);
      const result = await api.getEngagements({ org_id: orgId });
      setEngagements(result.data || []);
    } catch (error) {
      console.error('Failed to load engagements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEngagement = async (data: any) => {
    try {
      await api.createEngagement({ ...data, org_id: orgId });
      setShowCreateForm(false);
      loadEngagements();
    } catch (error) {
      console.error('Failed to create engagement:', error);
    }
  };

  const handleUpdateStatus = async (engagementId: number, status: string) => {
    try {
      await api.updateEngagementStatus(engagementId, status, orgId);
      loadEngagements();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  if (loading) {
    return <div className="p-4">Loading engagements...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Engagements</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          New Engagement
        </button>
      </div>

      <div className="grid gap-4">
        {engagements.map((engagement) => (
          <div key={engagement.id} className="border rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">{engagement.name}</h3>
                <p className="text-gray-600">{engagement.client_name} • {engagement.type}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-1 rounded text-sm ${
                    engagement.status === 'active' ? 'bg-green-100 text-green-800' :
                    engagement.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {engagement.status}
                  </span>
                  <span className={`px-2 py-1 rounded text-sm ${
                    engagement.health === 'green' ? 'bg-green-100 text-green-800' :
                    engagement.health === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {engagement.health}
                  </span>
                  {engagement.progress_pct !== undefined && (
                    <span className="text-sm text-gray-600">
                      {Math.round(engagement.progress_pct * 100)}% complete
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <select
                  value={engagement.status}
                  onChange={(e) => handleUpdateStatus(engagement.id, e.target.value)}
                  className="border rounded px-2 py-1"
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button
                  onClick={() => setSelectedEngagement(engagement)}
                  className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreateForm && (
        <CreateEngagementForm
          onSubmit={handleCreateEngagement}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {selectedEngagement && (
        <EngagementDetails
          engagement={selectedEngagement}
          orgId={orgId}
          api={api}
          onClose={() => setSelectedEngagement(null)}
        />
      )}
    </div>
  );
}

interface CreateEngagementFormProps {
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

function CreateEngagementForm({ onSubmit, onCancel }: CreateEngagementFormProps) {
  const [formData, setFormData] = useState({
    client_id: '',
    type: 'project',
    name: '',
    owner_id: '',
    start_at: '',
    due_at: '',
    contract_id: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      client_id: Number(formData.client_id),
      owner_id: Number(formData.owner_id),
      contract_id: formData.contract_id ? Number(formData.contract_id) : undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">Create New Engagement</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
              className="w-full border rounded px-3 py-2"
              required
            >
              <option value="project">Project</option>
              <option value="audit">Audit</option>
              <option value="job">Job</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full border rounded px-3 py-2"
              required
            />
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
            <label className="block text-sm font-medium mb-1">Owner ID</label>
            <input
              type="number"
              value={formData.owner_id}
              onChange={(e) => setFormData({...formData, owner_id: e.target.value})}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="datetime-local"
              value={formData.start_at}
              onChange={(e) => setFormData({...formData, start_at: e.target.value})}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Due Date</label>
            <input
              type="datetime-local"
              value={formData.due_at}
              onChange={(e) => setFormData({...formData, due_at: e.target.value})}
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

interface EngagementDetailsProps {
  engagement: Engagement;
  orgId: number;
  api: EngagementsApi;
  onClose: () => void;
}

function EngagementDetails({ engagement, orgId, api, onClose }: EngagementDetailsProps) {
  const [activeTab, setActiveTab] = useState<'features' | 'milestones' | 'change-requests'>('features');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">{engagement.name}</h3>
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
              onClick={() => setActiveTab('features')}
              className={`px-4 py-2 ${activeTab === 'features' ? 'border-b-2 border-blue-500' : ''}`}
            >
              Features
            </button>
            <button
              onClick={() => setActiveTab('milestones')}
              className={`px-4 py-2 ${activeTab === 'milestones' ? 'border-b-2 border-blue-500' : ''}`}
            >
              Milestones
            </button>
            <button
              onClick={() => setActiveTab('change-requests')}
              className={`px-4 py-2 ${activeTab === 'change-requests' ? 'border-b-2 border-blue-500' : ''}`}
            >
              Change Requests
            </button>
          </div>
        </div>

        <div className="min-h-[300px]">
          {activeTab === 'features' && <FeaturesTab engagementId={engagement.id} orgId={orgId} api={api} />}
          {activeTab === 'milestones' && <MilestonesTab engagementId={engagement.id} orgId={orgId} api={api} />}
          {activeTab === 'change-requests' && <ChangeRequestsTab engagementId={engagement.id} orgId={orgId} api={api} />}
        </div>
      </div>
    </div>
  );
}

// Placeholder components for tabs
function FeaturesTab({ engagementId, orgId, api }: { engagementId: number; orgId: number; api: EngagementsApi }) {
  return <div className="p-4 text-center text-gray-500">Features management coming soon...</div>;
}

function MilestonesTab({ engagementId, orgId, api }: { engagementId: number; orgId: number; api: EngagementsApi }) {
  return <div className="p-4 text-center text-gray-500">Milestones management coming soon...</div>;
}

function ChangeRequestsTab({ engagementId, orgId, api }: { engagementId: number; orgId: number; api: EngagementsApi }) {
  return <div className="p-4 text-center text-gray-500">Change requests management coming soon...</div>;
}
