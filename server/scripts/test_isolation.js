

async function testSuperAdminIsolation() {
    console.log('1. Logging in as SuperAdmin...');
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'superadmin2@rapidflo.com', password: 'SuperPassword@123' })
    });
    
    if (!loginRes.ok) {
        console.error('Login failed:', await loginRes.text());
        return;
    }
    
    const { token, user } = await loginRes.json();
    console.log('Login success! SuperAdmin:', user.email);
    console.log('Available companies:', user.availableCompanies.map(c => c.name).join(', '));
    
    // Pick the first available company
    const targetCompany = user.availableCompanies[0];
    if (!targetCompany) {
        console.log('No companies available to test.');
        return;
    }
    
    console.log(`\n2. Attempting to fetch CRM stats WITHOUT X-Company-Id header (Should fail or return empty)`);
    const noHeaderRes = await fetch('http://localhost:3001/api/crm/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Response without header:', noHeaderRes.status, await noHeaderRes.text());
    
    console.log(`\n3. Attempting to fetch CRM stats WITH X-Company-Id header for ${targetCompany.name}`);
    const withHeaderRes = await fetch('http://localhost:3001/api/crm/stats', {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'X-Company-Id': targetCompany.id
        }
    });
    
    if (withHeaderRes.ok) {
        const data = await withHeaderRes.json();
        console.log('SUCCESS! Isolated data retrieved for', targetCompany.name);
        console.log('Stats:', data);
    } else {
        console.error('FAILED to get isolated data:', withHeaderRes.status, await withHeaderRes.text());
    }
    
    console.log(`\n4. Checking active database context via Dashboard health endpoint`);
    const healthRes = await fetch('http://localhost:3001/api/admin/system-health', {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'X-Company-Id': targetCompany.id
        }
    });
    
    if (healthRes.ok) {
        const health = await healthRes.json();
        console.log('Health check success! Company records found:', health.companyRecords);
    } else {
        console.log('Health check failed:', await healthRes.text());
    }
}

testSuperAdminIsolation();
