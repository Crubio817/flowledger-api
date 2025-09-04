import { useEffect, useState } from 'react';
import { getClients, fetchClientFromUrl, createClientViaProcedure, createClientContact, createClientNote } from '../lib/api';

export default function Clients() {
  const [items, setItems] = useState<any[]>([]);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    isActive: true,
    packCode: '',
    ownerUserId: 1, // Default owner
    logoUrl: '',
    contact: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      title: ''
    },
    location: {
      city: '',
      stateProvince: '',
      country: '',
      postalCode: ''
    },
    industry: '',
    notes: '',
    clientNote: {
      title: '',
      content: '',
      noteType: 'linkedin_summary'
    }
  });

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    const list = await getClients(20);
    setItems(list);
  };

  const handleFetchFromUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const data = await fetchClientFromUrl(url);
      setFormData({
        name: data.name || '',
        isActive: true,
        packCode: '',
        ownerUserId: 1,
        logoUrl: data.logo_url || '',
        contact: {
          firstName: data.contact?.first_name || '',
          lastName: data.contact?.last_name || '',
          email: data.contact?.email || '',
          phone: data.contact?.phone || '',
          title: data.contact?.title || ''
        },
        location: {
          city: data.location?.city || '',
          stateProvince: data.location?.state_province || '',
          country: data.location?.country || '',
          postalCode: data.location?.postal_code || ''
        },
        industry: data.industry || '',
        notes: data.notes || '',
        clientNote: {
          title: data.client_note?.title || 'LinkedIn Summary',
          content: data.client_note?.content || '',
          noteType: data.client_note?.note_type || 'linkedin_summary'
        }
      });
    } catch (error) {
      alert('Failed to fetch data from URL');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async () => {
    try {
      // Create the client
      const clientResult = await createClientViaProcedure({
        Name: formData.name,
        IsActive: formData.isActive,
        PackCode: formData.packCode || null,
        PrimaryContactId: formData.ownerUserId,
        OwnerUserId: formData.ownerUserId,
        LogoUrl: formData.logoUrl || null
      });
      const clientId = clientResult.data?.client_id;

      if (clientId) {
        // Create primary contact if data exists
        if (formData.contact.firstName || formData.contact.lastName) {
          await createClientContact({
            client_id: clientId,
            first_name: formData.contact.firstName,
            last_name: formData.contact.lastName,
            email: formData.contact.email,
            phone: formData.contact.phone,
            title: formData.contact.title,
            is_primary: true,
            is_active: true
          });
        }

        // Create client note if content exists
        if (formData.clientNote.content) {
          await createClientNote(clientId, {
            title: formData.clientNote.title,
            content: formData.clientNote.content,
            note_type: formData.clientNote.noteType,
            is_important: false,
            is_active: true
          });
        }

        alert('Client created successfully!');
        loadClients();
        // Reset form
        setFormData({
          name: '',
          isActive: true,
          packCode: '',
          ownerUserId: 1,
          logoUrl: '',
          contact: { firstName: '', lastName: '', email: '', phone: '', title: '' },
          location: { city: '', stateProvince: '', country: '', postalCode: '' },
          industry: '',
          notes: '',
          clientNote: { title: '', content: '', noteType: 'linkedin_summary' }
        });
        setUrl('');
      }
    } catch (error) {
      alert('Failed to create client');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Clients</h2>
      
      {/* Client Creation Form */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h3 className="text-lg font-semibold mb-4">Create New Client</h3>
        
        {/* URL Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">LinkedIn URL (optional)</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.linkedin.com/company/example"
              className="flex-1 p-2 border rounded"
            />
            <button
              onClick={handleFetchFromUrl}
              disabled={loading || !url.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
            >
              {loading ? 'Fetching...' : 'Fetch Data'}
            </button>
          </div>
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Client Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Logo URL</label>
            <input
              type="url"
              value={formData.logoUrl}
              onChange={(e) => setFormData({...formData, logoUrl: e.target.value})}
              placeholder="https://example.com/logo.png"
              className="w-full p-2 border rounded"
            />
          </div>
        </div>

        {/* Contact Info */}
        <div className="mb-4">
          <h4 className="font-medium mb-2">Primary Contact</h4>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="First Name"
              value={formData.contact.firstName}
              onChange={(e) => setFormData({...formData, contact: {...formData.contact, firstName: e.target.value}})}
              className="p-2 border rounded"
            />
            <input
              type="text"
              placeholder="Last Name"
              value={formData.contact.lastName}
              onChange={(e) => setFormData({...formData, contact: {...formData.contact, lastName: e.target.value}})}
              className="p-2 border rounded"
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.contact.email}
              onChange={(e) => setFormData({...formData, contact: {...formData.contact, email: e.target.value}})}
              className="p-2 border rounded"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={formData.contact.phone}
              onChange={(e) => setFormData({...formData, contact: {...formData.contact, phone: e.target.value}})}
              className="p-2 border rounded"
            />
            <input
              type="text"
              placeholder="Title"
              value={formData.contact.title}
              onChange={(e) => setFormData({...formData, contact: {...formData.contact, title: e.target.value}})}
              className="p-2 border rounded col-span-2"
            />
          </div>
        </div>

        {/* Location */}
        <div className="mb-4">
          <h4 className="font-medium mb-2">Location</h4>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="City"
              value={formData.location.city}
              onChange={(e) => setFormData({...formData, location: {...formData.location, city: e.target.value}})}
              className="p-2 border rounded"
            />
            <input
              type="text"
              placeholder="State/Province"
              value={formData.location.stateProvince}
              onChange={(e) => setFormData({...formData, location: {...formData.location, stateProvince: e.target.value}})}
              className="p-2 border rounded"
            />
            <input
              type="text"
              placeholder="Country"
              value={formData.location.country}
              onChange={(e) => setFormData({...formData, location: {...formData.location, country: e.target.value}})}
              className="p-2 border rounded"
            />
            <input
              type="text"
              placeholder="Postal Code"
              value={formData.location.postalCode}
              onChange={(e) => setFormData({...formData, location: {...formData.location, postalCode: e.target.value}})}
              className="p-2 border rounded"
            />
          </div>
        </div>

        {/* Industry and Notes */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Industry</label>
            <input
              type="text"
              value={formData.industry}
              onChange={(e) => setFormData({...formData, industry: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <input
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>

        {/* Client Note */}
        <div className="mb-4">
          <h4 className="font-medium mb-2">Client Note</h4>
          <input
            type="text"
            placeholder="Note Title"
            value={formData.clientNote.title}
            onChange={(e) => setFormData({...formData, clientNote: {...formData.clientNote, title: e.target.value}})}
            className="w-full p-2 border rounded mb-2"
          />
          <textarea
            placeholder="Note Content"
            value={formData.clientNote.content}
            onChange={(e) => setFormData({...formData, clientNote: {...formData.clientNote, content: e.target.value}})}
            className="w-full p-4 border rounded"
            rows={3}
          />
        </div>

        <button
          onClick={handleCreateClient}
          disabled={!formData.name.trim()}
          className="px-6 py-2 bg-green-500 text-white rounded disabled:opacity-50"
        >
          Create Client
        </button>
      </div>

      {/* Clients Table */}
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
