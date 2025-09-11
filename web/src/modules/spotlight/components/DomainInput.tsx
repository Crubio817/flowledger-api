import React, { useState, useEffect } from 'react';

interface DomainInputProps {
  value: string;
  onChange: (value: string) => void;
  orgId: number;
}

export function DomainInput({ value, onChange, orgId }: DomainInputProps) {
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDomains = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/spotlights/domains?org_id=${orgId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch domains');
        }
        const result = await response.json();

        // Ensure result is an array
        if (Array.isArray(result)) {
          setDomains(result);
        } else {
          console.warn('getSpotlightDomains returned non-array:', result);
          setDomains([]);
        }
      } catch (error) {
        console.error('Failed to fetch domains:', error);
        setError('Failed to load domains');
        setDomains([]);
      } finally {
        setLoading(false);
      }
    };

    if (orgId) {
      fetchDomains();
    }
  }, [orgId]);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter domain (e.g., tech, finance)"
        list="domain-suggestions"
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <datalist id="domain-suggestions">
        {domains.map((domain) => (
          <option key={domain} value={domain} />
        ))}
      </datalist>
      {loading && (
        <div className="absolute right-2 top-2 text-sm text-gray-500">
          Loading...
        </div>
      )}
      {error && (
        <div className="absolute right-2 top-2 text-sm text-red-500">
          {error}
        </div>
      )}
    </div>
  );
}
