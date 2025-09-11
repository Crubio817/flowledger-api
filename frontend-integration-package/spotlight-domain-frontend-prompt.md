# Frontend Prompt: Spotlight Domain Suggestions

## Overview
The Spotlight module now includes a new endpoint to fetch unique domains for suggestions. This adds value to the open-ended domain field by providing autocomplete options based on existing data, encouraging consistency while allowing custom entries.

## New Endpoint
- **GET /api/spotlights/domains?org_id={org_id}**
- Returns: Array of strings (unique domains)
- Example Response: `["tech", "finance", "healthcare", "marketing"]`

## UI Implementation Suggestions

### 1. Domain Input Field
- Use a combobox or autocomplete input for the domain field in spotlight creation/editing forms.
- Fetch domains on component mount or when the input is focused.
- Allow free-text entry for custom domains.

### 2. Sample React Code (using frontend-integration-package)
```tsx
import { useState, useEffect } from 'react';
import { getSpotlightDomains } from './spotlights-api'; // Assuming this is added to spotlights-api.ts

interface DomainInputProps {
  value: string;
  onChange: (value: string) => void;
  orgId: number;
}

export function DomainInput({ value, onChange, orgId }: DomainInputProps) {
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDomains = async () => {
      setLoading(true);
      try {
        const result = await getSpotlightDomains(orgId);
        setDomains(result);
      } catch (error) {
        console.error('Failed to fetch domains:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDomains();
  }, [orgId]);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter domain (e.g., tech, finance)"
        list="domain-suggestions"
        className="w-full px-3 py-2 border rounded-md"
      />
      <datalist id="domain-suggestions">
        {domains.map((domain) => (
          <option key={domain} value={domain} />
        ))}
      </datalist>
      {loading && <div className="absolute right-2 top-2">Loading...</div>}
    </div>
  );
}
```

### 3. API Integration
Add to `spotlights-api.ts`:
```typescript
export async function getSpotlightDomains(orgId: number): Promise<string[]> {
  const response = await apiClient.get(`/api/spotlights/domains?org_id=${orgId}`);
  return response.data;
}
```

### 4. Benefits
- **Consistency**: Users see and reuse existing domains.
- **Flexibility**: Still allows custom domains.
- **User Experience**: Faster input with suggestions.
- **Data Quality**: Reduces typos and variations (e.g., "tech" vs "technology").

### 5. Additional Features
- Sort domains by usage frequency (modify backend to return counts).
- Add a "Create new domain" option if not in suggestions.
- Cache domains locally to avoid repeated API calls.

## Testing
- Test with org_id=1 (assuming seeded data).
- Verify empty state when no domains exist.
- Ensure free-text entry still works.

## Notes
- The domain field remains required for spotlight creation.
- Backend filters out null/empty domains from suggestions.
- Update any existing domain inputs to use this new component.
