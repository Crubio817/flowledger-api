#!/usr/bin/env node

/**
 * Memory Layer Test Script
 * Tests the memory layer integration with FlowLedger
 */

const sql = require('mssql');
const crypto = require('crypto');

// Configuration - adjust for your environment
const config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'flowledger',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'your-password',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function testMemoryLayer() {
  console.log('🧠 Testing FlowLedger Memory Layer...\n');

  try {
    // Connect to database
    await sql.connect(config);
    console.log('✅ Connected to database');

    // Test 1: Create a test pursuit
    console.log('\n📝 Test 1: Creating test pursuit...');
    const pursuitResult = await sql.query(`
      INSERT INTO app.pursuit (org_id, candidate_id, pursuit_stage, created_at, updated_at)
      OUTPUT INSERTED.pursuit_id
      VALUES (1, 1, 'qual', SYSUTCDATETIME(), SYSUTCDATETIME())
    `);
    const pursuitId = pursuitResult.recordset[0].pursuit_id;
    console.log(`✅ Created pursuit ID: ${pursuitId}`);

    // Test 2: Create memory atom via work_event
    console.log('\n🧠 Test 2: Creating memory atom...');
    await sql.query(`
      INSERT INTO app.work_event (org_id, entity_type, entity_id, event_type, payload, created_at)
      VALUES (
        1,
        'memory',
        ${pursuitId},
        'memory.atom.created',
        '{
          "entity_type": "pursuit",
          "entity_id": ${pursuitId},
          "atom_type": "status",
          "content": "Test pursuit created for memory layer validation",
          "source": {
            "system": "test",
            "origin_id": "test:${pursuitId}",
            "url": "/pursuits/${pursuitId}"
          },
          "occurred_at": "${new Date().toISOString()}"
        }',
        SYSUTCDATETIME()
      )
    `);
    console.log('✅ Memory atom event queued');

    // Test 3: Simulate memory processor
    console.log('\n⚙️ Test 3: Simulating memory processor...');
    const eventResult = await sql.query(`
      UPDATE TOP(1) e
      SET e.processed_at = SYSUTCDATETIME()
      OUTPUT DELETED.*
      FROM app.work_event e
      WHERE e.event_type = 'memory.atom.created'
        AND e.processed_at IS NULL
    `);

    if (eventResult.recordset.length > 0) {
      const event = eventResult.recordset[0];
      const payload = JSON.parse(event.payload);

      // Generate content hash
      const contentHash = crypto.createHash('sha256')
        .update(payload.content.toLowerCase().trim())
        .digest();

      // Insert atom
      await sql.query(`
        INSERT INTO memory.atom (
          org_id, entity_type, entity_id, atom_type, content, content_hash,
          source_system, source_id, source_url, occurred_at, created_at
        ) VALUES (
          ${event.org_id},
          '${payload.entity_type}',
          ${payload.entity_id},
          '${payload.atom_type}',
          '${payload.content.replace(/'/g, "''")}',
          0x${contentHash.toString('hex')},
          '${payload.source.system}',
          '${payload.source.origin_id}',
          '${payload.source.url}',
          '${payload.occurred_at}',
          SYSUTCDATETIME()
        )
      `);
      console.log('✅ Memory atom processed and stored');
    }

    // Test 4: Check memory atom was created
    console.log('\n🔍 Test 4: Verifying memory atom...');
    const atomResult = await sql.query(`
      SELECT * FROM memory.atom
      WHERE org_id = 1 AND entity_type = 'pursuit' AND entity_id = ${pursuitId}
    `);

    if (atomResult.recordset.length > 0) {
      console.log('✅ Memory atom found:');
      console.log(`   - Type: ${atomResult.recordset[0].atom_type}`);
      console.log(`   - Content: ${atomResult.recordset[0].content}`);
      console.log(`   - Source: ${atomResult.recordset[0].source_system}`);
    } else {
      console.log('❌ Memory atom not found');
    }

    // Test 5: Trigger summary rebuild
    console.log('\n🔄 Test 5: Triggering summary rebuild...');
    await sql.query(`
      INSERT INTO app.work_event (org_id, entity_type, entity_id, event_type, payload, created_at)
      VALUES (
        1,
        'memory',
        ${pursuitId},
        'memory.summary.rebuild',
        '{
          "entity_type": "pursuit",
          "entity_id": ${pursuitId}
        }',
        SYSUTCDATETIME()
      )
    `);
    console.log('✅ Summary rebuild event queued');

    // Test 6: Simulate summary rebuild
    console.log('\n📊 Test 6: Simulating summary rebuild...');
    const rebuildEventResult = await sql.query(`
      UPDATE TOP(1) e
      SET e.processed_at = SYSUTCDATETIME()
      OUTPUT DELETED.*
      FROM app.work_event e
      WHERE e.event_type = 'memory.summary.rebuild'
        AND e.processed_at IS NULL
    `);

    if (rebuildEventResult.recordset.length > 0) {
      const rebuildEvent = rebuildEventResult.recordset[0];
      const rebuildPayload = JSON.parse(rebuildEvent.payload);

      // Get atoms for summary
      const atomsForSummary = await sql.query(`
        SELECT TOP 20 atom_type, content, occurred_at, source_url, score
        FROM memory.atom
        WHERE org_id = ${rebuildEvent.org_id}
          AND entity_type = '${rebuildPayload.entity_type}'
          AND entity_id = ${rebuildPayload.entity_id}
        ORDER BY score DESC, occurred_at DESC
      `);

      // Build summary
      const summary = {
        key_facts: atomsForSummary.recordset
          .filter(a => a.atom_type === 'preference' || a.atom_type === 'decision')
          .slice(0, 5)
          .map(a => a.content),
        recent_activity: atomsForSummary.recordset
          .slice(0, 3)
          .map(a => `${a.atom_type}: ${a.content}`),
        decisions: atomsForSummary.recordset
          .filter(a => a.atom_type === 'decision')
          .slice(0, 3)
          .map(a => a.content)
      };

      // Upsert summary
      await sql.query(`
        MERGE memory.summary AS target
        USING (SELECT ${rebuildEvent.org_id} org_id, '${rebuildPayload.entity_type}' entity_type, ${rebuildPayload.entity_id} entity_id) AS source
        ON target.org_id = source.org_id
          AND target.entity_type = source.entity_type
          AND target.entity_id = source.entity_id
        WHEN MATCHED THEN
          UPDATE SET
            summary_json = '${JSON.stringify(summary).replace(/'/g, "''")}',
            top_atoms_json = '${JSON.stringify(atomsForSummary.recordset.slice(0, 10)).replace(/'/g, "''")}',
            last_built_at = SYSUTCDATETIME(),
            version = version + 1
        WHEN NOT MATCHED THEN
          INSERT (org_id, entity_type, entity_id, summary_json, top_atoms_json)
          VALUES (source.org_id, source.entity_type, source.entity_id, '${JSON.stringify(summary).replace(/'/g, "''")}', '${JSON.stringify(atomsForSummary.recordset.slice(0, 10)).replace(/'/g, "''")}');
      `);
      console.log('✅ Summary built and cached');
    }

    // Test 7: Check summary was created
    console.log('\n📈 Test 7: Verifying memory summary...');
    const summaryResult = await sql.query(`
      SELECT * FROM memory.summary
      WHERE org_id = 1 AND entity_type = 'pursuit' AND entity_id = ${pursuitId}
    `);

    if (summaryResult.recordset.length > 0) {
      console.log('✅ Memory summary found:');
      const summary = JSON.parse(summaryResult.recordset[0].summary_json);
      console.log(`   - Key facts: ${summary.key_facts.length}`);
      console.log(`   - Recent activity: ${summary.recent_activity.length}`);
      console.log(`   - Decisions: ${summary.decisions.length}`);
      console.log(`   - Version: ${summaryResult.recordset[0].version}`);
    } else {
      console.log('❌ Memory summary not found');
    }

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await sql.query(`DELETE FROM memory.summary WHERE org_id = 1 AND entity_type = 'pursuit' AND entity_id = ${pursuitId}`);
    await sql.query(`DELETE FROM memory.atom WHERE org_id = 1 AND entity_type = 'pursuit' AND entity_id = ${pursuitId}`);
    await sql.query(`DELETE FROM app.pursuit WHERE pursuit_id = ${pursuitId}`);
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 Memory Layer test completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Run the actual memory processor worker');
    console.log('2. Test the /api/memory/card endpoint');
    console.log('3. Add memory atoms to more FlowLedger events');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await sql.close();
  }
}

// Run the test
testMemoryLayer().catch(console.error);
