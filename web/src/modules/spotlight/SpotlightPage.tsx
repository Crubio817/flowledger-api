import React from 'react';
import { SpotlightAnalyticsDashboard, SpotlightBuilder } from './components';

export default function SpotlightPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Spotlight Management</h1>
          <p className="mt-2 text-gray-600">
            Create and manage your Ideal Customer Profiles (ICPs)
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Analytics Dashboard */}
          <div className="bg-white rounded-lg shadow">
            <SpotlightAnalyticsDashboard />
          </div>

          {/* Spotlight Builder */}
          <div className="bg-white rounded-lg shadow">
            <SpotlightBuilder />
          </div>
        </div>
      </div>
    </div>
  );
}
