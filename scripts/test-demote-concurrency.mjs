import { spawn } from 'child_process';

function runSql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['exec', '-i', 'supabase_db_splititup', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A'],
      { windowsHide: true }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const isError = code !== 0 || stderr.includes('ERROR:');
      resolve({ error: isError, code, stderr: stderr.trim(), stdout: stdout.trim() });
    });

    child.stdin.write(sql);
    child.stdin.end();
  });
}

async function main() {
  console.log('=== GR9 Concurrency Test: Two admins demoting each other simultaneously ===');

  const groupId = '90000000-0000-0000-0000-000000000009';
  const adminA = '99999999-9999-9999-9999-999999999981';
  const adminB = '99999999-9999-9999-9999-999999999982';

  // 1. Setup users and group with 2 admins
  console.log('1. Setting up group with 2 admins (Admin A & Admin B)...');
  const setupRes = await runSql(`
    DELETE FROM public.groups WHERE id = '${groupId}';
    DELETE FROM public.profiles WHERE id IN ('${adminA}', '${adminB}');
    DELETE FROM auth.users WHERE id IN ('${adminA}', '${adminB}');

    INSERT INTO auth.users (id, email) VALUES
      ('${adminA}', 'admin_a_gr9@example.com'),
      ('${adminB}', 'admin_b_gr9@example.com');

    INSERT INTO public.profiles (id, name) VALUES
      ('${adminA}', 'Admin A GR9'),
      ('${adminB}', 'Admin B GR9')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

    INSERT INTO public.groups (id, name, created_by)
    VALUES ('${groupId}', 'GR9 Concurrency Group', '${adminA}');

    INSERT INTO public.group_members (group_id, user_id, role, status) VALUES
      ('${groupId}', '${adminA}', 'admin', 'active'),
      ('${groupId}', '${adminB}', 'admin', 'active');
  `);

  const initialAdmins = await runSql(
    `SELECT count(*) FROM public.group_members WHERE group_id = '${groupId}' AND role = 'admin' AND status = 'active';`
  );
  console.log(`Initial admin count: ${initialAdmins.stdout} (expected: 2)`);

  // 2. Concurrently call set_member_role
  console.log('2. Firing concurrent demote calls: A demotes B, B demotes A...');

  const sessionA = `
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL "request.jwt.claims" to '{"sub": "${adminA}", "role": "authenticated"}';
    SELECT public.set_member_role('${groupId}', '${adminB}', 'member');
    COMMIT;
  `;

  const sessionB = `
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL "request.jwt.claims" to '{"sub": "${adminB}", "role": "authenticated"}';
    SELECT public.set_member_role('${groupId}', '${adminA}', 'member');
    COMMIT;
  `;

  const [resA, resB] = await Promise.all([
    runSql(sessionA),
    runSql(sessionB),
  ]);

  console.log(`Session A: ${resA.error ? `FAILED (${resA.stderr})` : 'SUCCEEDED'}`);
  console.log(`Session B: ${resB.error ? `FAILED (${resB.stderr})` : 'SUCCEEDED'}`);

  // 3. Verify final state in database
  const finalAdmins = await runSql(
    `SELECT count(*) FROM public.group_members WHERE group_id = '${groupId}' AND role = 'admin' AND status = 'active';`
  );
  console.log(`3. Final active admin count in database: ${finalAdmins.stdout}`);

  const oneSucceeded = (!resA.error && resB.error) || (resA.error && !resB.error);
  const failureExpected = (resA.error && (resA.stderr.includes('not_admin') || resA.stderr.includes('last_admin'))) ||
                          (resB.error && (resB.stderr.includes('not_admin') || resB.stderr.includes('last_admin')));
  const finalCountIs1 = parseInt(finalAdmins.stdout, 10) === 1;

  if (oneSucceeded && failureExpected && finalCountIs1) {
    console.log('✅ TEST PASSED: Serialized: exactly one demotion succeeded, the other failed, and exactly 1 admin remains.');
  } else {
    console.error('❌ TEST FAILED: Concurrency invariant violated!');
    process.exit(1);
  }

  // Cleanup
  await runSql(`DELETE FROM public.groups WHERE id = '${groupId}'; DELETE FROM public.profiles WHERE id IN ('${adminA}', '${adminB}'); DELETE FROM auth.users WHERE id IN ('${adminA}', '${adminB}');`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
