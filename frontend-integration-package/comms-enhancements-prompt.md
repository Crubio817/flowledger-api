# Communication Hub Enhancements - Frontend Implementation Guide

## 🎯 Overview

The Communication Hub has been enhanced with **4 major new features**:

1. **Real-time Updates** - WebSocket integration for live messaging
2. **File Attachments** - Upload/download with resumable transfers
3. **Advanced Search** - Full-text search across threads and messages
4. **Email Templates** - Pre-built templates with variable substitution

## 📁 Backend Status: ✅ COMPLETE

All backend work is done:
- ✅ Database tables created (WebSocket connections, templates, search history, upload sessions)
- ✅ API endpoints implemented (20+ new endpoints)
- ✅ WebSocket server integrated
- ✅ Full-text search configured
- ✅ File upload system ready

## 🔧 Frontend Implementation Requirements

### **1. Real-time Updates (WebSocket)**

#### **WebSocket Connection**
```typescript
// WebSocket client setup
class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 1000;

  connect(principalId: number, orgId: number) {
    const wsUrl = `ws://localhost:4001`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;

      // Register connection
      this.send({
        type: 'register',
        principal_id: principalId,
        org_id: orgId
      });
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.handleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private handleMessage(data: any) {
    switch (data.type) {
      case 'welcome':
        console.log('Connected to Communication Hub');
        break;

      case 'new_message':
        // Handle new message notification
        this.emit('new_message', data.message);
        break;

      case 'thread_updated':
        // Handle thread status changes
        this.emit('thread_updated', data.thread);
        break;

      case 'pong':
        // Handle ping response
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  }

  subscribe(subscriptionType: string, resourceId?: number) {
    this.send({
      type: 'subscribe',
      subscription_type: subscriptionType,
      resource_id: resourceId
    });
  }

  unsubscribe(subscriptionType: string, resourceId?: number) {
    this.send({
      type: 'unsubscribe',
      subscription_type: subscriptionType,
      resource_id: resourceId
    });
  }

  private send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
        this.connect(/* pass parameters */);
      }, this.reconnectInterval * this.reconnectAttempts);
    }
  }
}
```

#### **API Integration**
```typescript
// Register WebSocket connection
const registerConnection = async (socketId: string, principalId: number, orgId: number) => {
  return api.post('/api/comms/ws/connect', {
    socket_id: socketId,
    principal_id: principalId,
    user_agent: navigator.userAgent,
    ip_address: null // Will be determined server-side
  }, {
    params: { org_id: orgId }
  });
};

// Subscribe to real-time updates
const subscribeToUpdates = async (socketId: string, subscriptionType: string, resourceId?: number, orgId?: number) => {
  return api.post('/api/comms/ws/subscribe', {
    socket_id: socketId,
    subscription_type: subscriptionType,
    resource_id: resourceId
  }, {
    params: { org_id: orgId }
  });
};
```

#### **Usage Examples**
```typescript
// Initialize WebSocket client
const wsClient = new WebSocketClient();

// Connect when user logs in
wsClient.connect(currentUser.principal_id, currentOrg.id);

// Subscribe to thread updates
wsClient.subscribe('thread', threadId);

// Subscribe to all threads for a mailbox
wsClient.subscribe('mailbox', mailboxId);

// Subscribe to all threads (for admins)
wsClient.subscribe('all_threads');

// Listen for real-time events
wsClient.on('new_message', (message) => {
  // Update UI with new message
  updateThreadWithNewMessage(message);
});

wsClient.on('thread_updated', (thread) => {
  // Update thread status in UI
  updateThreadStatus(thread);
});
```

### **2. File Attachments**

#### **File Upload System**
```typescript
// Initialize resumable upload
const initUpload = async (filename: string, mimeType: string, totalSize: number, threadId?: number) => {
  return api.post('/api/comms/upload/init', {
    filename,
    mime_type: mimeType,
    total_size_bytes: totalSize,
    thread_id: threadId
  }, {
    params: { org_id: currentOrg.id, principal_id: currentUser.principal_id }
  });
};

// Upload file chunk
const uploadChunk = async (sessionId: string, chunkIndex: number, chunkData: string) => {
  return api.post(`/api/comms/upload/${sessionId}/chunk`, {
    chunk_index: chunkIndex,
    chunk_data: chunkData // Base64 encoded
  });
};

// Get upload status
const getUploadStatus = async (sessionId: string) => {
  return api.get(`/api/comms/upload/${sessionId}/status`);
};
```

#### **React Component Example**
```typescript
const FileUpload = ({ threadId, onUploadComplete }: FileUploadProps) => {
  const [uploadSession, setUploadSession] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (file: File) => {
    setIsUploading(true);

    try {
      // Initialize upload session
      const session = await initUpload(file.name, file.type, file.size, threadId);
      setUploadSession(session.data);

      // Split file into chunks and upload
      const chunkSize = session.data.chunk_size;
      const totalChunks = Math.ceil(file.size / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await uploadChunk(session.data.session_id, i, base64Data);

          const progress = ((i + 1) / totalChunks) * 100;
          setUploadProgress(progress);
        };
        reader.readAsDataURL(chunk);
      }

      onUploadComplete(session.data);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="file-upload">
      <input
        type="file"
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        disabled={isUploading}
      />
      {isUploading && (
        <div className="upload-progress">
          <progress value={uploadProgress} max={100} />
          <span>{Math.round(uploadProgress)}%</span>
        </div>
      )}
    </div>
  );
};
```

#### **Attachment Display**
```typescript
const AttachmentItem = ({ attachment }: { attachment: Attachment }) => {
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.includes('pdf')) return '📄';
    return '📎';
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="attachment-item">
      <span className="file-icon">{getFileIcon(attachment.mime_type)}</span>
      <div className="file-info">
        <span className="file-name">{attachment.name}</span>
        <span className="file-size">{formatFileSize(attachment.size_bytes)}</span>
      </div>
      <button
        onClick={() => window.open(attachment.blob_url, '_blank')}
        className="download-btn"
      >
        Download
      </button>
    </div>
  );
};
```

### **3. Advanced Search**

#### **Search API Integration**
```typescript
// Advanced search function
const searchCommunications = async (query: string, options: SearchOptions = {}) => {
  const {
    type = 'general', // 'general', 'threads', 'messages'
    mailbox_id,
    status,
    from_date,
    to_date,
    page = 1,
    limit = 20
  } = options;

  return api.get('/api/comms/search', {
    params: {
      org_id: currentOrg.id,
      principal_id: currentUser.principal_id,
      q: query,
      type,
      mailbox_id,
      status,
      from_date,
      to_date,
      page,
      limit
    }
  });
};

// Search hook for React
const useCommunicationSearch = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = async (query: string, options: SearchOptions = {}) => {
    if (!query || query.length < 3) return;

    setLoading(true);
    setError(null);

    try {
      const response = await searchCommunications(query, options);
      setResults(response.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { results, loading, error, search };
};
```

#### **Search UI Component**
```typescript
const AdvancedSearch = () => {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('general');
  const [filters, setFilters] = useState({
    mailbox_id: null,
    status: null,
    from_date: null,
    to_date: null
  });

  const { results, loading, error, search } = useCommunicationSearch();

  const handleSearch = () => {
    search(query, {
      type: searchType,
      ...filters
    });
  };

  return (
    <div className="advanced-search">
      <div className="search-input-group">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search communications..."
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <select
          value={searchType}
          onChange={(e) => setSearchType(e.target.value)}
        >
          <option value="general">All</option>
          <option value="threads">Threads</option>
          <option value="messages">Messages</option>
        </select>
        <button onClick={handleSearch} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      <div className="search-filters">
        <select
          value={filters.status || ''}
          onChange={(e) => setFilters({...filters, status: e.target.value || null})}
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="waiting_on_us">Waiting on Us</option>
          <option value="waiting_on_client">Waiting on Client</option>
          <option value="closed">Closed</option>
        </select>

        <input
          type="date"
          value={filters.from_date || ''}
          onChange={(e) => setFilters({...filters, from_date: e.target.value || null})}
        />
        <input
          type="date"
          value={filters.to_date || ''}
          onChange={(e) => setFilters({...filters, to_date: e.target.value || null})}
        />
      </div>

      {error && <div className="search-error">{error}</div>}

      <div className="search-results">
        {results.map((result) => (
          <SearchResultItem key={result.id} result={result} />
        ))}
      </div>
    </div>
  );
};
```

### **4. Email Templates**

#### **Template Management**
```typescript
// Get all templates
const getEmailTemplates = async (type?: string, isActive?: boolean) => {
  return api.get('/api/comms/templates', {
    params: {
      org_id: currentOrg.id,
      type,
      is_active: isActive
    }
  });
};

// Create new template
const createEmailTemplate = async (template: EmailTemplateInput) => {
  return api.post('/api/comms/templates', template, {
    params: {
      org_id: currentOrg.id,
      principal_id: currentUser.principal_id
    }
  });
};

// Get template with variables
const getEmailTemplate = async (templateId: number) => {
  return api.get(`/api/comms/templates/${templateId}`, {
    params: { org_id: currentOrg.id }
  });
};
```

#### **Template Application**
```typescript
// Apply template variables
const applyTemplate = (template: EmailTemplate, variables: Record<string, any>) => {
  let subject = template.subject_template;
  let body = template.body_template;

  // Replace variables in subject and body
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    subject = subject.replace(regex, value);
    body = body.replace(regex, value);
  });

  return { subject, body };
};

// Template selector component
const TemplateSelector = ({ onTemplateSelect }: { onTemplateSelect: (template: EmailTemplate) => void }) => {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  useEffect(() => {
    getEmailTemplates('response', true).then(response => {
      setTemplates(response.data.data);
    });
  }, []);

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    onTemplateSelect(template);
  };

  return (
    <div className="template-selector">
      <select
        value={selectedTemplate?.template_id || ''}
        onChange={(e) => {
          const template = templates.find(t => t.template_id === Number(e.target.value));
          handleTemplateSelect(template);
        }}
      >
        <option value="">Select a template...</option>
        {templates.map(template => (
          <option key={template.template_id} value={template.template_id}>
            {template.name}
          </option>
        ))}
      </select>
    </div>
  );
};
```

#### **Template Editor**
```typescript
const TemplateEditor = ({ template, onSave }: TemplateEditorProps) => {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    subject_template: template?.subject_template || '',
    body_template: template?.body_template || '',
    template_type: template?.template_type || 'general',
    variables: template?.variables || []
  });

  const addVariable = () => {
    setFormData({
      ...formData,
      variables: [...formData.variables, {
        variable_name: '',
        variable_type: 'text',
        default_value: '',
        description: '',
        is_required: false
      }]
    });
  };

  const updateVariable = (index: number, field: string, value: any) => {
    const updatedVariables = [...formData.variables];
    updatedVariables[index] = { ...updatedVariables[index], [field]: value };
    setFormData({ ...formData, variables: updatedVariables });
  };

  const handleSave = async () => {
    try {
      if (template) {
        // Update existing template
        await api.patch(`/api/comms/templates/${template.template_id}`, formData, {
          params: { org_id: currentOrg.id }
        });
      } else {
        // Create new template
        await createEmailTemplate(formData);
      }
      onSave();
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  return (
    <div className="template-editor">
      <div className="form-group">
        <label>Template Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
        />
      </div>

      <div className="form-group">
        <label>Subject Template</label>
        <input
          type="text"
          value={formData.subject_template}
          onChange={(e) => setFormData({...formData, subject_template: e.target.value})}
          placeholder="Use {{variable_name}} for dynamic content"
        />
      </div>

      <div className="form-group">
        <label>Body Template</label>
        <textarea
          value={formData.body_template}
          onChange={(e) => setFormData({...formData, body_template: e.target.value})}
          rows={10}
          placeholder="Use {{variable_name}} for dynamic content"
        />
      </div>

      <div className="variables-section">
        <h4>Template Variables</h4>
        {formData.variables.map((variable, index) => (
          <div key={index} className="variable-item">
            <input
              type="text"
              placeholder="Variable name"
              value={variable.variable_name}
              onChange={(e) => updateVariable(index, 'variable_name', e.target.value)}
            />
            <select
              value={variable.variable_type}
              onChange={(e) => updateVariable(index, 'variable_type', e.target.value)}
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="boolean">Boolean</option>
            </select>
            <input
              type="text"
              placeholder="Default value"
              value={variable.default_value}
              onChange={(e) => updateVariable(index, 'default_value', e.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={variable.is_required}
                onChange={(e) => updateVariable(index, 'is_required', e.target.checked)}
              />
              Required
            </label>
          </div>
        ))}
        <button type="button" onClick={addVariable}>Add Variable</button>
      </div>

      <button onClick={handleSave}>Save Template</button>
    </div>
  );
};
```

## 🎨 UI Integration Guidelines

### **Navigation Updates**
Add new menu items to your sidebar:
```typescript
// Add to navigation
const navigationItems = [
  // ... existing items
  {
    name: 'Communication Hub',
    icon: MessageCircle,
    children: [
      { name: 'Threads', href: '/comms/threads' },
      { name: 'Search', href: '/comms/search' },
      { name: 'Templates', href: '/comms/templates' },
      { name: 'Settings', href: '/settings/comms' }
    ]
  }
];
```

### **Real-time Indicators**
```typescript
// Add online status indicators
const OnlineStatus = ({ principalId }: { principalId: number }) => {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    // Subscribe to presence updates
    wsClient.subscribe('presence', principalId);

    wsClient.on('presence_update', (data) => {
      if (data.principal_id === principalId) {
        setIsOnline(data.is_online);
      }
    });
  }, [principalId]);

  return (
    <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`}>
      {isOnline ? '🟢' : '⚪'}
    </div>
  );
};
```

### **Notification System**
```typescript
// Toast notifications for real-time events
const NotificationSystem = () => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    wsClient.on('new_message', (message) => {
      addNotification({
        type: 'info',
        title: 'New Message',
        message: `New message in ${message.thread_subject}`,
        action: () => navigate(`/comms/threads/${message.thread_id}`)
      });
    });

    wsClient.on('thread_updated', (thread) => {
      addNotification({
        type: 'success',
        title: 'Thread Updated',
        message: `Thread "${thread.subject}" status changed to ${thread.status}`
      });
    });
  }, []);

  return (
    <ToastContainer>
      {notifications.map(notification => (
        <Toast key={notification.id} {...notification} />
      ))}
    </ToastContainer>
  );
};
```

## ✅ Success Criteria

### **Functional Requirements**
- [ ] WebSocket connection establishes successfully
- [ ] Real-time message notifications work
- [ ] File uploads complete successfully
- [ ] Advanced search returns relevant results
- [ ] Email templates apply correctly
- [ ] All features work on mobile devices

### **Technical Requirements**
- [ ] WebSocket reconnection logic implemented
- [ ] File upload progress indicators
- [ ] Search results load within 2 seconds
- [ ] Template variables substitute correctly
- [ ] Error handling for all edge cases
- [ ] TypeScript types for all new features

### **Performance Requirements**
- [ ] WebSocket connection maintains < 100ms latency
- [ ] File uploads support files up to 100MB
- [ ] Search queries complete in < 500ms
- [ ] UI remains responsive during uploads
- [ ] Memory usage stays under 200MB

## 🚀 Implementation Phases

### **Phase 1: Foundation (Week 1)**
1. Set up WebSocket client
2. Implement basic file upload
3. Add search input component
4. Create template selector

### **Phase 2: Core Features (Week 2)**
1. Complete WebSocket integration
2. Implement resumable uploads
3. Build advanced search UI
4. Template editor functionality

### **Phase 3: Polish & Testing (Week 3)**
1. Error handling and edge cases
2. Performance optimization
3. Mobile responsiveness
4. Integration testing

### **Phase 4: Advanced Features (Week 4)**
1. Bulk operations
2. Analytics dashboard
3. Advanced template features
4. Notification preferences

## 🔧 API Endpoints Summary

### **WebSocket Management**
- `POST /api/comms/ws/connect` - Register connection
- `POST /api/comms/ws/disconnect` - Unregister connection
- `POST /api/comms/ws/subscribe` - Subscribe to updates
- `POST /api/comms/ws/unsubscribe` - Unsubscribe from updates

### **File Upload**
- `POST /api/comms/upload/init` - Initialize upload
- `POST /api/comms/upload/:session_id/chunk` - Upload chunk
- `GET /api/comms/upload/:session_id/status` - Get upload status

### **Advanced Search**
- `GET /api/comms/search` - Search communications

### **Email Templates**
- `GET /api/comms/templates` - List templates
- `POST /api/comms/templates` - Create template
- `GET /api/comms/templates/:id` - Get template details

## 🎯 Next Steps

1. **Start with WebSocket integration** - Most impactful for user experience
2. **Implement file uploads** - Essential for communication workflows
3. **Add advanced search** - Improves productivity significantly
4. **Build template system** - Reduces repetitive work

**The backend is fully ready - focus on creating an exceptional user experience with these new capabilities!** 🚀

---

*Backend Implementation: ✅ Complete*
*Frontend Implementation: 🔄 Your Turn*
*Testing & Deployment: 📋 Next Phase*
