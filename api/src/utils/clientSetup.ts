import { getPool, sql } from '../db/pool';
import { logActivity } from './activity';

export interface ClientSetupParams {
  client_id: number;
  client_name: string;
  playbook_code: string;
  owner_user_id: number;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export async function orchestrateClientSetup(params: ClientSetupParams) {
  const { client_id, client_name, playbook_code, owner_user_id } = params;
  const pool = await getPool();
  const client_slug = slugify(client_name || `c${client_id}`);
  const tx = pool.transaction();
  await tx.begin();
  try {
  // Placeholder for future blob folder provisioning (contracts, inputs, outputs, maps, exports)
  const folderPaths = ['contracts','inputs','outputs','maps','exports'].map(p=>`clients/${client_slug}/${p}`);
  // (Deferred actual storage + DB tracking until blob feature implemented)
  await logActivity({ type: 'ClientCreated', title: `system_setup: storage placeholder`, client_id });

    const docs = [
      { code: 'welcome_packet', title: 'Welcome Packet.pdf' },
      { code: 'interview_guide', title: 'Interview Guide.docx' }
    ];
    for (const d of docs) {
      await tx.request()
        .input('cid', sql.Int, client_id)
        .input('code', sql.NVarChar(80), d.code)
        .input('title', sql.NVarChar(200), d.title)
        .query(`IF NOT EXISTS (SELECT 1 FROM app.client_documents WHERE client_id=@cid AND doc_code=@code)
          INSERT INTO app.client_documents (client_id, doc_code, title, status, created_utc)
          VALUES (@cid, @code, @title, N'placeholder', SYSUTCDATETIME())`);
    }
    await logActivity({ type: 'ClientCreated', title: `system_setup: documents`, client_id });

    const integrations = ['QBO','Procurify','M365'];
    for (const integ of integrations) {
      await tx.request()
        .input('cid', sql.Int, client_id)
        .input('code', sql.NVarChar(40), integ)
        .query(`IF NOT EXISTS (SELECT 1 FROM app.client_integrations WHERE client_id=@cid AND integration_code=@code)
          INSERT INTO app.client_integrations (client_id, integration_code, status, created_utc)
          VALUES (@cid, @code, N'waiting', SYSUTCDATETIME())`);
    }
    await logActivity({ type: 'ClientCreated', title: `system_setup: integrations`, client_id });

    // Kickoff message draft using new app.message_drafts table (channel='email')
    await tx.request()
      .input('cid', sql.Int, client_id)
      .input('channel', sql.NVarChar(50), 'email')
      .input('tmpl', sql.NVarChar(50), 'KICKOFF_EMAIL')
      .input('created_by', sql.Int, owner_user_id)
      .input('subject', sql.NVarChar(200), `Kickoff: ${client_name}`)
      .input('body_html', sql.NVarChar(sql.MAX), `<h1>Kickoff for ${client_name}</h1><p>Playbook: ${playbook_code}</p>`)
      .input('body_text', sql.NVarChar(sql.MAX), `Kickoff for ${client_name}\nPlaybook: ${playbook_code}`)
      .query(`IF NOT EXISTS (SELECT 1 FROM app.message_drafts WHERE client_id=@cid AND template_code=@tmpl)
        INSERT INTO app.message_drafts (client_id, channel, template_code, created_by_user_id, subject, body_html, body_text)
        VALUES (@cid, @channel, @tmpl, @created_by, @subject, @body_html, @body_text)`);
    await logActivity({ type: 'ClientCreated', title: `system_setup: kickoff draft`, client_id });

    await tx.commit();
    return { client_slug, folders: folderPaths };
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}
