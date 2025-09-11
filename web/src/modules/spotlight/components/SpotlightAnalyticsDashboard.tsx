import React, { useState, useEffect } from 'react';

interface SpotlightAnalytics {
  domain: string;
  count: number;
}

interface SpotlightStats {
  total_spotlights?: number;
  // some callers/examples expect `total_profiles` — accept either name
  total_profiles?: number;
  total_domains: number;
  analytics: SpotlightAnalytics[];
}

export function SpotlightAnalyticsDashboard() {
  const [stats, setStats] = useState<SpotlightStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch analytics data
        const analyticsResponse = await fetch('/api/spotlights/analytics?org_id=1');
        if (!analyticsResponse.ok) {
          throw new Error('Failed to fetch analytics');
        }
        const analytics = await analyticsResponse.json();

        // Fetch domains
        const domainsResponse = await fetch('/api/spotlights/domains?org_id=1');
        if (!domainsResponse.ok) {
          throw new Error('Failed to fetch domains');
        }
        const domains = await domainsResponse.json();

        // Fetch spotlights list
        const spotlightsResponse = await fetch('/api/spotlights?org_id=1');
        if (!spotlightsResponse.ok) {
          throw new Error('Failed to fetch spotlights');
        }
        const spotlightsData = await spotlightsResponse.json();

        setStats({
          total_spotlights: spotlightsData.data?.length || 0,
          total_domains: domains.length,
          analytics: analytics.data || []
        });
      } catch (err) {
        console.error('Error fetching stats:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Spotlight Analytics</h2>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-32 bg-gray-200 rounded mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Spotlight Analytics</h2>
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <p className="text-red-800">Error loading analytics: {error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Spotlight Analytics</h2>
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Spotlight Analytics</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Total Spotlights</h3>
          <p className="text-3xl font-bold text-blue-600">{stats?.total_profiles ?? stats?.total_spotlights ?? 0}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Unique Domains</h3>
          <p className="text-3xl font-bold text-green-600">{stats.total_domains}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Domain Categories</h3>
          <p className="text-3xl font-bold text-purple-600">{stats?.analytics?.length ?? 0}</p>
        </div>
      </div>

      {/* Domain Analytics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Domain Distribution</h3>
    {stats?.analytics && stats.analytics.length > 0 ? (
          <div className="space-y-4">
      {stats.analytics.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                  <span className="font-medium">{item.domain}</span>
                </div>
                <div className="flex items-center">
                  <div className="w-24 bg-gray-200 rounded-full h-2 mr-3">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{
                        // avoid division by zero when all counts are zero or analytics is empty
                        width: `${(item.count / Math.max(...stats.analytics.map(a => a.count), 1)) * 100}%`
                      }}
                    ></div>
                  </div>
                  <span className="text-sm text-gray-600 w-8 text-right">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No domain data available</p>
        )}
      </div>
    </div>
  );
}
