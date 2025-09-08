#!/usr/bin/env node

async function testBillingEndpoints() {
  const baseURL = 'http://localhost:4001/api';

  try {
    console.log('Testing billing endpoints...\n');

    // Test 1: Get contracts
    console.log('1. Testing GET /billing/contracts');
    const contractsResponse = await fetch(`${baseURL}/billing/contracts?org_id=1`);
    if (!contractsResponse.ok) throw new Error(`HTTP ${contractsResponse.status}`);
    const contractsData = await contractsResponse.json();
    console.log('✅ Contracts endpoint working');
    console.log(`   Found ${contractsData.data?.length || 0} contracts\n`);

    // Test 2: Get time entries
    console.log('2. Testing GET /billing/time-entries');
    const timeEntriesResponse = await fetch(`${baseURL}/billing/time-entries?org_id=1`);
    if (!timeEntriesResponse.ok) throw new Error(`HTTP ${timeEntriesResponse.status}`);
    const timeEntriesData = await timeEntriesResponse.json();
    console.log('✅ Time entries endpoint working');
    console.log(`   Found ${timeEntriesData.data?.length || 0} time entries\n`);

    // Test 3: Get invoices
    console.log('3. Testing GET /billing/invoices');
    const invoicesResponse = await fetch(`${baseURL}/billing/invoices?org_id=1`);
    if (!invoicesResponse.ok) throw new Error(`HTTP ${invoicesResponse.status}`);
    const invoicesData = await invoicesResponse.json();
    console.log('✅ Invoices endpoint working');
    console.log(`   Found ${invoicesData.data?.length || 0} invoices\n`);

    console.log('🎉 All billing endpoints are working correctly!');

  } catch (error) {
    console.error('❌ Error testing billing endpoints:');
    console.error(`   ${error.message}`);
  }
}

testBillingEndpoints();
