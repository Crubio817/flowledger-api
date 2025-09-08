import React, { useState, useEffect } from 'react';
import {
  getAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  testAutomationRule,
  getAutomationLogs,
  AutomationRule,
  AutomationAction,
  AutomationLog,
  AutomationTestResult,
  AUTOMATION_TEMPLATES,
  ACTION_CATALOG,
  EVENT_TYPES
} from './automation-api';

interface AutomationManagerProps {
  orgId: number;
}

export const AutomationManager: React.FC<AutomationManagerProps> = ({ orgId }) => {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [selectedTab, setSelectedTab] = useState<'rules' | 'logs' | 'templates'>('rules');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [testResult, setTestResult] = useState<AutomationTestResult | null>(null);

  useEffect(() => {
    loadRules();
    loadLogs();
  }, [orgId]);

  const loadRules = async () => {
    try {
      const data = await getAutomationRules(orgId);
      setRules(data);
    } catch (error) {
      console.error('Failed to load rules:', error);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await getAutomationLogs(orgId, { limit: 50 });
      setLogs(data);
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  const handleCreateRule = async (ruleData: Omit<AutomationRule, 'rule_id'>) => {
    try {
      await createAutomationRule(orgId, ruleData);
      await loadRules();
      setShowCreateForm(false);
    } catch (error) {
      console.error('Failed to create rule:', error);
    }
  };

  const handleUpdateRule = async (ruleId: number, updates: Partial<AutomationRule>) => {
    try {
      await updateAutomationRule(orgId, ruleId, updates);
      await loadRules();
      setEditingRule(null);
    } catch (error) {
      console.error('Failed to update rule:', error);
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      try {
        await deleteAutomationRule(orgId, ruleId);
        await loadRules();
      } catch (error) {
        console.error('Failed to delete rule:', error);
      }
    }
  };

  const handleTestRule = async (rule: AutomationRule) => {
    const sampleEvent = {
      type: rule.trigger.event_types[0],
      tenant_id: orgId,
      source: 'test',
      payload: { test: true }
    };

    try {
      const result = await testAutomationRule(orgId, rule, sampleEvent);
      setTestResult(result);
    } catch (error) {
      console.error('Failed to test rule:', error);
    }
  };

  return (
    <div className="automation-manager">
      <div className="tabs">
        <button
          className={selectedTab === 'rules' ? 'active' : ''}
          onClick={() => setSelectedTab('rules')}
        >
          Rules ({rules.length})
        </button>
        <button
          className={selectedTab === 'logs' ? 'active' : ''}
          onClick={() => setSelectedTab('logs')}
        >
          Activity Logs
        </button>
        <button
          className={selectedTab === 'templates' ? 'active' : ''}
          onClick={() => setSelectedTab('templates')}
        >
          Templates
        </button>
      </div>

      {selectedTab === 'rules' && (
        <RulesTab
          rules={rules}
          onCreate={() => setShowCreateForm(true)}
          onEdit={setEditingRule}
          onDelete={handleDeleteRule}
          onTest={handleTestRule}
          testResult={testResult}
        />
      )}

      {selectedTab === 'logs' && (
        <LogsTab logs={logs} />
      )}

      {selectedTab === 'templates' && (
        <TemplatesTab
          templates={AUTOMATION_TEMPLATES}
          onUseTemplate={(template) => {
            setEditingRule(template as AutomationRule);
            setSelectedTab('rules');
          }}
        />
      )}

      {(showCreateForm || editingRule) && (
        <RuleForm
          rule={editingRule}
          onSave={editingRule ? (updates) => handleUpdateRule(editingRule.rule_id!, updates) : handleCreateRule}
          onCancel={() => {
            setShowCreateForm(false);
            setEditingRule(null);
          }}
        />
      )}
    </div>
  );
};

interface RulesTabProps {
  rules: AutomationRule[];
  onCreate: () => void;
  onEdit: (rule: AutomationRule) => void;
  onDelete: (ruleId: number) => void;
  onTest: (rule: AutomationRule) => void;
  testResult: AutomationTestResult | null;
}

const RulesTab: React.FC<RulesTabProps> = ({
  rules, onCreate, onEdit, onDelete, onTest, testResult
}) => {
  return (
    <div className="rules-tab">
      <div className="rules-header">
        <h3>Automation Rules</h3>
        <button onClick={onCreate} className="btn-primary">Create Rule</button>
      </div>

      <div className="rules-list">
        {rules.map(rule => (
          <div key={rule.rule_id} className="rule-card">
            <div className="rule-header">
              <h4>{rule.name}</h4>
              <div className="rule-actions">
                <button onClick={() => onTest(rule)} className="btn-secondary">Test</button>
                <button onClick={() => onEdit(rule)} className="btn-secondary">Edit</button>
                <button onClick={() => onDelete(rule.rule_id!)} className="btn-danger">Delete</button>
              </div>
            </div>

            <div className="rule-details">
              <div className="rule-status">
                <span className={`status ${rule.is_enabled ? 'enabled' : 'disabled'}`}>
                  {rule.is_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div className="rule-trigger">
                <strong>Trigger:</strong> {rule.trigger.event_types.join(', ')}
              </div>

              <div className="rule-actions-count">
                <strong>Actions:</strong> {rule.actions.length}
              </div>

              {rule.throttle && (
                <div className="rule-throttle">
                  <strong>Throttle:</strong> {rule.throttle.limit} per {rule.throttle.per}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {testResult && (
        <div className={`test-result ${testResult.matches ? 'success' : 'error'}`}>
          <h4>Test Result</h4>
          <p>{testResult.matches ? 'Rule would trigger' : `Rule would not trigger: ${testResult.reason}`}</p>
          {testResult.evaluation && (
            <ul>
              <li>Trigger matched: {testResult.evaluation.trigger_matched ? '✓' : '✗'}</li>
              <li>Conditions passed: {testResult.evaluation.conditions_passed ? '✓' : '✗'}</li>
              <li>Throttle OK: {testResult.evaluation.throttle_ok ? '✓' : '✗'}</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

interface LogsTabProps {
  logs: AutomationLog[];
}

const LogsTab: React.FC<LogsTabProps> = ({ logs }) => {
  return (
    <div className="logs-tab">
      <h3>Automation Activity Logs</h3>

      <div className="logs-list">
        {logs.map(log => (
          <div key={log.log_id} className={`log-entry ${log.outcome}`}>
            <div className="log-header">
              <span className="log-outcome">{log.outcome}</span>
              <span className="log-timestamp">{new Date(log.created_at!).toLocaleString()}</span>
            </div>

            <div className="log-details">
              {log.rule_name && <div><strong>Rule:</strong> {log.rule_name}</div>}
              {log.event_id && <div><strong>Event:</strong> {log.event_id}</div>}
              {log.error_message && <div><strong>Error:</strong> {log.error_message}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface TemplatesTabProps {
  templates: Record<string, any>;
  onUseTemplate: (template: any) => void;
}

const TemplatesTab: React.FC<TemplatesTabProps> = ({ templates, onUseTemplate }) => {
  return (
    <div className="templates-tab">
      <h3>Automation Templates</h3>
      <p>Choose a template to get started quickly:</p>

      <div className="templates-grid">
        {Object.entries(templates).map(([key, template]) => (
          <div key={key} className="template-card">
            <h4>{template.name}</h4>
            <p>Trigger: {template.trigger.event_types.join(', ')}</p>
            <p>Actions: {template.actions.length}</p>
            <button onClick={() => onUseTemplate(template)} className="btn-primary">
              Use Template
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

interface RuleFormProps {
  rule: AutomationRule | null;
  onSave: (rule: any) => void;
  onCancel: () => void;
}

const RuleForm: React.FC<RuleFormProps> = ({ rule, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: rule?.name || '',
    is_enabled: rule?.is_enabled ?? true,
    trigger: rule?.trigger || { event_types: [] },
    conditions: rule?.conditions || null,
    throttle: rule?.throttle || null,
    actions: rule?.actions || []
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const addAction = () => {
    setFormData(prev => ({
      ...prev,
      actions: [...prev.actions, { type: '', params: {} }]
    }));
  };

  const updateAction = (index: number, action: AutomationAction) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.map((a, i) => i === index ? action : a)
    }));
  };

  const removeAction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="rule-form-overlay">
      <div className="rule-form">
        <h3>{rule ? 'Edit Rule' : 'Create Rule'}</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name:</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label>Enabled:</label>
            <input
              type="checkbox"
              checked={formData.is_enabled}
              onChange={e => setFormData(prev => ({ ...prev, is_enabled: e.target.checked }))}
            />
          </div>

          <div className="form-group">
            <label>Trigger Events:</label>
            <select
              multiple
              value={formData.trigger.event_types}
              onChange={e => {
                const values = Array.from(e.target.selectedOptions, option => option.value);
                setFormData(prev => ({
                  ...prev,
                  trigger: { ...prev.trigger, event_types: values }
                }));
              }}
            >
              {EVENT_TYPES.map(eventType => (
                <option key={eventType} value={eventType}>{eventType}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Actions:</label>
            {formData.actions.map((action, index) => (
              <div key={index} className="action-item">
                <select
                  value={action.type}
                  onChange={e => updateAction(index, { ...action, type: e.target.value })}
                >
                  <option value="">Select action type...</option>
                  {Object.entries(ACTION_CATALOG).map(([type, config]) => (
                    <option key={type} value={type}>{config.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => removeAction(index)}>Remove</button>
              </div>
            ))}
            <button type="button" onClick={addAction}>Add Action</button>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary">Save</button>
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AutomationManager;
