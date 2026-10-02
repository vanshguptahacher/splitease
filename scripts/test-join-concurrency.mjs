import { spawn } from 'child_process';

function runSql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', 'supabase_db_splititup', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A'], {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`psql failed with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.stdin.write(sql);
    child.stdin.end();
  });
}

async function main() {
  console.log('=== GJ20 Concurrency Test: Two users joining a 49-member group simultaneously ===');

  const groupId = '90000000-0000-0000-0000-000000000001';
  const code = 'KNCUR249';
  const userA = '99999999-9999-9999-9999-999999999991';
  const userB = '99999999-9999-9999-9999-999999999992';
  const adminUser = '99999999-9999-9999-9999-999999999990';

  // 1. Setup users and group with 49 active members
  console.log('1. Setting up group with 49 members and invite code:', code);
  await runSql(`
    DELETE FROM public.groups WHERE id = '${groupId}';
    DELETE FROM auth.users WHERE email LIKE 'dummy_%@example.com' OR id IN ('${userA}', '${userB}', '${adminUser}');
    
    INSERT INTO auth.users (id, email) VALUES
      ('${adminUser}', 'admin_concur@example.com'),
      ('${userA}', 'concur_a@example.com'),
      ('${userB}', 'concur_b@example.com');
      
    INSERT INTO public.profiles (id, name) VALUES
      ('${adminUser}', 'Admin User'),
      ('${userA}', 'Concurrent User A'),
      ('${userB}', 'Concurrent User B');

    INSERT INTO public.groups (id, name, created_by)
    VALUES ('${groupId}', 'Concurrency 49 Group', '${adminUser}');

    INSERT INTO public.group_members (group_id, user_id, role, status)
    VALUES ('${groupId}', '${adminUser}', 'admin', 'active');

    INSERT INTO public.invites (group_id, code, created_by)
    VALUES ('${groupId}', '${code}', '${adminUser}');

    -- Populate 48 dummy members + 1 admin = 49 active members
    WITH dummy AS (
      SELECT gen_random_uuid() as id, 'dummy_' || i || '@example.com' as email, 'Dummy ' || i as name
      FROM generate_series(1, 48) i
    ),
    ins_auth AS (
      INSERT INTO auth.users (id, email)
      SELECT id, email FROM dummy
    ),
    ins_prof AS (
      INSERT INTO public.profiles (id, name)
      SELECT id, name FROM dummy
    )
    INSERT INTO public.group_members (group_id, user_id, role, status)
    SELECT '${groupId}', id, 'member', 'active'
    FROM dummy;
  `);

  const initialCount = await runSql(
    `SELECT count(*) FROM public.group_members WHERE group_id = '${groupId}' AND status = 'active';`
  );
  console.log(`Initial active member count: ${initialCount} (expected: 49)`);

  if (parseInt(initialCount, 10) !== 49) {
    throw new Error(`Expected 49 members initially, got ${initialCount}`);
  }

  // 2. Concurrently call join_group for User A and User B
  console.log('2. Firing concurrent join_group calls for User A and User B...');

  const sessionA = `
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL "request.jwt.claims" to '{"sub": "${userA}", "role": "authenticated"}';
    SELECT r_status FROM public.join_group('${code}');
    COMMIT;
  `;

  const sessionB = `
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL "request.jwt.claims" to '{"sub": "${userB}", "role": "authenticated"}';
    SELECT r_status FROM public.join_group('${code}');
    COMMIT;
  `;

  const [rawA, rawB] = await Promise.all([
    runSql(sessionA),
    runSql(sessionB),
  ]);

  // Extract the result of SELECT r_status FROM public.join_group(...)
  const linesA = rawA.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const linesB = rawB.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  
  // The line right before COMMIT is our returned status
  const commitIdxA = linesA.lastIndexOf('COMMIT');
  const resA = commitIdxA > 0 ? linesA[commitIdxA - 1] : linesA[linesA.length - 1];

  const commitIdxB = linesB.lastIndexOf('COMMIT');
  const resB = commitIdxB > 0 ? linesB[commitIdxB - 1] : linesB[linesB.length - 1];

  console.log(`User A result: "${resA}"`);
  console.log(`User B result: "${resB}"`);

  // 3. Verify final state
  const finalCount = await runSql(
    `SELECT count(*) FROM public.group_members WHERE group_id = '${groupId}' AND status = 'active';`
  );
  console.log(`3. Final active member count in database: ${finalCount}`);

  const hasOneJoined = (resA === 'joined' && resB === 'group_full') || (resA === 'group_full' && resB === 'joined');
  const countIs50 = parseInt(finalCount, 10) === 50;

  if (hasOneJoined && countIs50) {
    console.log('✅ TEST PASSED: Exactly one user joined, exactly one was rejected with group_full, and active members count is capped at 50.');
  } else {
    console.error('❌ TEST FAILED: Invariants violated!');
    process.exit(1);
  }

  // Cleanup
  await runSql(`DELETE FROM public.groups WHERE id = '${groupId}'; DELETE FROM auth.users WHERE email LIKE 'dummy_%@example.com' OR id IN ('${userA}', '${userB}', '${adminUser}');`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
