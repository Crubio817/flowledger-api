# Billing & Contracts Module - Frontend Implementation Guide

## Overview

The Billing & Contracts module provides comprehensive financial management capabilities for FlowLedger, including contract management, time tracking, invoicing, and payment processing. This guide covers the complete frontend implementation using the provided React components and API client.

## Architecture

### Core Components
- **BillingManager.tsx** - Main billing dashboard component
- **billing-api.ts** - TypeScript API client with Zod schemas
- **State Management** - React hooks for local state management
- **Real-time Updates** - WebSocket integration for live billing updates

### Key Features
- Multi-currency support with automatic exchange rate handling
- Revenue recognition engine for accurate financial reporting
- Time tracking with approval workflows
- Automated invoice generation from approved time entries
- Payment processing with multiple payment methods
- Collections management with outstanding balance tracking

## Quick Start

### 1. Import the Billing Components

```typescript
import { BillingManager } from './BillingManager';
import { billingApi } from './billing-api';
```

### 2. Add to Your App

```typescript
function App() {
  return (
    <div className="App">
      {/* Your existing components */}
      <BillingManager orgId={currentOrgId} />
    </div>
  );
}
```

### 3. Initialize API Client

```typescript
// Configure axios base URL and auth headers
billingApi.defaults.baseURL = 'https://your-api-domain.com/api';
billingApi.defaults.headers.common['Authorization'] = 'Bearer your-token';
```

## Component Usage

### BillingManager Component

The main `BillingManager` component provides a complete billing dashboard:

```typescript
<BillingManager
  orgId={orgId}
  userRole="admin" // Optional: 'admin', 'manager', 'user'
  currency="USD" // Optional: default currency
  onContractSelect={(contract) => console.log('Selected contract:', contract)}
  onInvoiceGenerated={(invoice) => console.log('Invoice generated:', invoice)}
/>
```

#### Props
- `orgId` (required): Organization ID for multi-tenancy
- `userRole` (optional): User role for permission-based UI
- `currency` (optional): Default currency for new contracts
- `onContractSelect` (optional): Callback when contract is selected
- `onInvoiceGenerated` (optional): Callback when invoice is generated

### Individual Tab Components

You can also use individual tab components for custom layouts:

```typescript
import {
  ContractsTab,
  TimeEntriesTab,
  InvoicesTab,
  PaymentsTab
} from './BillingManager';

// Use individual tabs
<ContractsTab orgId={orgId} />
<TimeEntriesTab orgId={orgId} />
<InvoicesTab orgId={orgId} />
<PaymentsTab orgId={orgId} />
```

## API Usage

### Contract Management

```typescript
import { billingApi } from './billing-api';

// Create a new contract
const newContract = await billingApi.createContract({
  org_id: 1,
  client_id: 123,
  contract_type: 'time_materials',
  title: 'Website Development',
  description: 'Full website redesign and development',
  currency: 'USD',
  total_value: 50000,
  start_date: '2024-01-01',
  end_date: '2024-03-31',
  billing_cycle: 'monthly',
  payment_terms: 'net_30'
});

// Get contracts with pagination
const contracts = await billingApi.getContracts({
  org_id: 1,
  page: 1,
  limit: 20,
  status: 'active'
});

// Update contract
const updatedContract = await billingApi.updateContract(contractId, {
  status: 'completed',
  actual_end_date: '2024-03-15'
});
```

### Time Entry Management

```typescript
// Create time entry
const timeEntry = await billingApi.createTimeEntry({
  org_id: 1,
  contract_id: contractId,
  assignment_id: assignmentId,
  date: '2024-01-15',
  hours: 8,
  description: 'Frontend development work',
  billable_rate: 150,
  is_billable: true
});

// Get time entries for approval
const pendingEntries = await billingApi.getTimeEntries({
  org_id: 1,
  status: 'pending_approval',
  page: 1,
  limit: 50
});

// Approve time entries
await billingApi.approveTimeEntries({
  org_id: 1,
  time_entry_ids: [1, 2, 3],
  approved_by: userId
});
```

### Invoice Generation

```typescript
// Generate invoice from approved time entries
const invoice = await billingApi.generateInvoice({
  org_id: 1,
  contract_id: contractId,
  time_entry_ids: [1, 2, 3, 4, 5],
  invoice_date: '2024-01-31',
  due_date: '2024-02-28',
  notes: 'Monthly invoice for January 2024'
});

// Get invoices
const invoices = await billingApi.getInvoices({
  org_id: 1,
  status: 'sent',
  page: 1,
  limit: 20
});

// Send invoice
await billingApi.sendInvoice(invoiceId, {
  email_recipients: ['client@example.com'],
  email_subject: 'Invoice #INV-001',
  email_body: 'Please find attached your monthly invoice.'
});
```

### Payment Processing

```typescript
// Record payment
const payment = await billingApi.createPayment({
  org_id: 1,
  invoice_id: invoiceId,
  amount: 12000,
  currency: 'USD',
  payment_date: '2024-02-15',
  payment_method: 'bank_transfer',
  reference_number: 'BT-2024-001',
  notes: 'Payment received via bank transfer'
});

// Get payments
const payments = await billingApi.getPayments({
  org_id: 1,
  invoice_id: invoiceId,
  page: 1,
  limit: 20
});
```

## Data Types

### Contract Types

```typescript
interface Contract {
  contract_id: number;
  org_id: number;
  client_id: number;
  contract_type: 'time_materials' | 'fixed_price' | 'milestone' | 'retainer' | 'prepaid';
  title: string;
  description?: string;
  currency: string;
  total_value: number;
  billed_value: number;
  remaining_value: number;
  start_date: string;
  end_date?: string;
  actual_end_date?: string;
  billing_cycle: 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'one_time';
  payment_terms: string;
  status: 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}
```

### Time Entry Types

```typescript
interface TimeEntry {
  time_entry_id: number;
  org_id: number;
  contract_id: number;
  assignment_id: number;
  user_id: number;
  date: string;
  hours: number;
  description: string;
  billable_rate: number;
  total_amount: number;
  is_billable: boolean;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'billed';
  approved_by?: number;
  approved_at?: string;
  rejected_reason?: string;
  created_at: string;
  updated_at: string;
}
```

### Invoice Types

```typescript
interface Invoice {
  invoice_id: number;
  org_id: number;
  contract_id: number;
  client_id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  notes?: string;
  sent_at?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
}
```

### Payment Types

```typescript
interface Payment {
  payment_id: number;
  org_id: number;
  invoice_id: number;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'wire_transfer' | 'other';
  reference_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}
```

## State Management

### Using React Hooks

```typescript
import { useState, useEffect } from 'react';
import { billingApi } from './billing-api';

function useContracts(orgId: number) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContracts = async () => {
    try {
      setLoading(true);
      const data = await billingApi.getContracts({ org_id: orgId });
      setContracts(data.contracts);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, [orgId]);

  return { contracts, loading, error, refetch: fetchContracts };
}
```

### Real-time Updates

```typescript
import { useEffect } from 'react';

function useBillingWebSocket(orgId: number, onUpdate: (data: any) => void) {
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:4001?org_id=${orgId}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type.startsWith('billing.')) {
        onUpdate(data);
      }
    };

    return () => ws.close();
  }, [orgId, onUpdate]);
}
```

## Error Handling

### API Error Handling

```typescript
try {
  const contract = await billingApi.createContract(contractData);
  console.log('Contract created:', contract);
} catch (error) {
  if (error.response) {
    // Server responded with error status
    console.error('API Error:', error.response.data.error);
  } else if (error.request) {
    // Network error
    console.error('Network Error:', error.message);
  } else {
    // Other error
    console.error('Error:', error.message);
  }
}
```

### Validation Errors

```typescript
import { z } from 'zod';

// Handle Zod validation errors
const handleApiError = (error: any) => {
  if (error.response?.data?.error?.issues) {
    // Zod validation errors
    const issues = error.response.data.error.issues;
    const messages = issues.map((issue: any) => issue.message);
    setValidationErrors(messages);
  } else {
    setGeneralError(error.message);
  }
};
```

## Styling and Theming

### CSS Classes

The components use Tailwind CSS classes. You can customize the appearance by:

1. **Overriding Tailwind classes** in your global CSS
2. **Using CSS modules** with custom class names
3. **Passing custom className props** to components

```css
/* Custom billing styles */
.billing-card {
  @apply bg-white rounded-lg shadow-md p-6 border border-gray-200;
}

.billing-button-primary {
  @apply bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded;
}

.billing-input {
  @apply border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500;
}
```

### Dark Mode Support

```typescript
// Add dark mode classes
const darkModeClasses = isDarkMode ? 'dark:bg-gray-800 dark:text-white' : '';
```

## Testing

### Unit Testing Components

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { BillingManager } from './BillingManager';

test('renders billing dashboard', () => {
  render(<BillingManager orgId={1} />);
  expect(screen.getByText('Billing & Contracts')).toBeInTheDocument();
});

test('creates new contract', async () => {
  render(<BillingManager orgId={1} />);
  const createButton = screen.getByText('New Contract');
  fireEvent.click(createButton);
  // Assert form appears and can be filled
});
```

### API Testing

```typescript
import { billingApi } from './billing-api';

test('creates contract successfully', async () => {
  const mockContract = { /* mock data */ };
  // Mock axios response
  jest.spyOn(billingApi, 'createContract').mockResolvedValue(mockContract);

  const result = await billingApi.createContract(mockContract);
  expect(result).toEqual(mockContract);
});
```

## Performance Optimization

### Memoization

```typescript
import { memo, useMemo } from 'react';

const ContractList = memo(({ contracts, onSelect }) => {
  const sortedContracts = useMemo(() => {
    return contracts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [contracts]);

  return (
    <div>
      {sortedContracts.map(contract => (
        <ContractItem
          key={contract.contract_id}
          contract={contract}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
});
```

### Lazy Loading

```typescript
import { lazy, Suspense } from 'react';

const BillingManager = lazy(() => import('./BillingManager'));

function App() {
  return (
    <Suspense fallback={<div>Loading billing module...</div>}>
      <BillingManager orgId={orgId} />
    </Suspense>
  );
}
```

### Pagination

```typescript
const [page, setPage] = useState(1);
const [contracts, setContracts] = useState([]);

const loadMore = async () => {
  const nextPage = page + 1;
  const data = await billingApi.getContracts({
    org_id: orgId,
    page: nextPage,
    limit: 20
  });
  setContracts(prev => [...prev, ...data.contracts]);
  setPage(nextPage);
};
```

## Security Considerations

### Authentication

```typescript
// Ensure API calls include authentication
billingApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Data Validation

```typescript
// Validate data before API calls
const validateContractData = (data: any) => {
  const schema = z.object({
    title: z.string().min(1, 'Title is required'),
    total_value: z.number().positive('Total value must be positive'),
    // ... other validations
  });

  return schema.parse(data);
};
```

## Integration Examples

### With Existing Modules

```typescript
// Integrate with People module
const assignContractToPerson = async (contractId: number, personId: number) => {
  // Create assignment in People module
  await peopleApi.createAssignment({
    org_id: orgId,
    person_id: personId,
    contract_id: contractId,
    role: 'project_manager'
  });

  // Update contract with assignment
  await billingApi.updateContract(contractId, {
    assignment_id: assignmentId
  });
};

// Integrate with Engagements module
const linkContractToEngagement = async (contractId: number, engagementId: number) => {
  await engagementsApi.linkEngagement({
    engagement_id: engagementId,
    contract_id: contractId
  });
};
```

### Custom Workflows

```typescript
// Custom approval workflow
const submitForApproval = async (timeEntryId: number) => {
  await billingApi.updateTimeEntry(timeEntryId, {
    status: 'pending_approval'
  });

  // Notify approvers
  await notificationApi.sendNotification({
    type: 'time_entry_approval',
    recipients: approverEmails,
    data: { time_entry_id: timeEntryId }
  });
};
```

## Troubleshooting

### Common Issues

1. **API Connection Issues**
   - Check base URL configuration
   - Verify authentication headers
   - Ensure CORS is properly configured

2. **State Management Problems**
   - Use React DevTools to inspect component state
   - Check for stale closures in useEffect
   - Verify prop drilling vs context usage

3. **Performance Issues**
   - Implement pagination for large datasets
   - Use React.memo for expensive components
   - Optimize re-renders with useMemo/useCallback

4. **TypeScript Errors**
   - Ensure all API types are properly imported
   - Check Zod schema compatibility
   - Verify component prop types

### Debug Mode

```typescript
// Enable debug logging
if (process.env.NODE_ENV === 'development') {
  billingApi.interceptors.request.use((config) => {
    console.log('API Request:', config);
    return config;
  });

  billingApi.interceptors.response.use((response) => {
    console.log('API Response:', response);
    return response;
  });
}
```

## Migration Guide

### From Legacy Billing Systems

1. **Data Migration**
   - Export data from legacy system
   - Transform data to match FlowLedger schema
   - Use bulk import APIs for large datasets

2. **API Integration**
   - Replace legacy API calls with FlowLedger billing APIs
   - Update authentication mechanisms
   - Handle response format changes

3. **UI Migration**
   - Replace legacy components with FlowLedger components
   - Update styling to match new design system
   - Migrate custom workflows to new architecture

## Support and Resources

### Documentation
- [API Reference](./api-types.ts)
- [Component Documentation](./BillingManager.tsx)
- [State Guards](../api/src/state/billing-guards.ts)

### Getting Help
- Check the [GitHub Issues](https://github.com/your-org/flowledger-api/issues) for known issues
- Review the [FlowLedger API Documentation](../api/README.md)
- Contact the development team for custom integrations

---

This guide provides comprehensive coverage of the Billing & Contracts module implementation. For specific use cases or custom requirements, refer to the source code and API documentation.
