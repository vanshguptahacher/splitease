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
  console.log('================================================================');
  console.log('Sub-phase 5.3 Concurrency Tests: Settlements Status Machine');
  console.log('================================================================\n');

  const groupId = '88888888-0000-0000-0000-000000000001';
  const payerId = '88888888-1111-0000-0000-000000000001';
  const receiverId = '88888888-2222-0000-0000-000000000002';
  const adminId = '88888888-3333-0000-0000-000000000003';

  // Helper to reset test environment
  async function resetFixtures() {
    await runSql(`
      DELETE FROM public.groups WHERE id = '${groupId}';
      DELETE FROM public.profiles WHERE id IN ('${payerId}', '${receiverId}', '${adminId}');
      DELETE FROM auth.users WHERE id IN ('${payerId}', '${receiverId}', '${adminId}');

      INSERT INTO auth.users (id, email) VALUES
        ('${payerId}', 'payer_conc@example.com'),
        ('${receiverId}', 'recv_conc@example.com'),
        ('${adminId}', 'admin_conc@example.com');

      INSERT INTO public.profiles (id, name) VALUES
        ('${payerId}', 'Payer Concurrency'),
        ('${receiverId}', 'Receiver Concurrency'),
        ('${adminId}', 'Admin Concurrency')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

      INSERT INTO public.groups (id, name, created_by)
      VALUES ('${groupId}', 'Settlement Concurrency Group', '${adminId}');

      INSERT INTO public.group_members (group_id, user_id, role, status) VALUES
        ('${groupId}', '${adminId}', 'admin', 'active'),
        ('${groupId}', '${payerId}', 'member', 'active'),
        ('${groupId}', '${receiverId}', 'member', 'active');
    `);
  }

  // ---------------------------------------------------------------------------
  // Test 1: Two identical pending creations at the same moment
  // ---------------------------------------------------------------------------
  console.log('Test 1: Two identical pending creations at the same moment...');
  await resetFixtures();

  const req1 = '11111111-1111-1111-1111-111111111111';
  const req2 = '22222222-2222-2222-2222-222222222222';
  const amount = 45000;

  const sessionCreateA = `
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL "request.jwt.claims" to '{"sub": "${payerId}", "role": "authenticated"}';
    SELECT public.create_settlement('${groupId}', '${req1}', '${payerId}', '${receiverId}', ${amount}, 'cash', 'Concurrent 1');
    COMMIT;
  `;

  const sessionCreateB = `
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL "request.jwt.claims" to '{"sub": "${payerId}", "role": "authenticated"}';
    SELECT public.create_settlement('${groupId}', '${req2}', '${payerId}', '${receiverId}', ${amount}, 'cash', 'Concurrent 2');
    COMMIT;
  `;

  const [resCreateA, resCreateB] = await Promise.all([
    runSql(sessionCreateA),
    runSql(sessionCreateB),
  ]);

  console.log(`  Call A: ${resCreateA.error ? `FAILED (${resCreateA.stderr})` : `SUCCEEDED (${resCreateA.stdout})`}`);
  console.log(`  Call B: ${resCreateB.error ? `FAILED (${resCreateB.stderr})` : `SUCCEEDED (${resCreateB.stdout})`}`);

  const oneCreateSucceeded = (!resCreateA.error && resCreateB.error) || (resCreateA.error && !resCreateB.error);
  const duplicatePendingCaught = (resCreateA.error && resCreateA.stderr.includes('duplicate_pending')) ||
                                 (resCreateB.error && resCreateB.stderr.includes('duplicate_pending'));

  const countSettlements = await runSql(`
    SELECT count(*) FROM public.settlements WHERE group_id = '${groupId}' AND amount_minor = ${amount};
  `);
  console.log(`  Settlements in DB: ${countSettlements.stdout} (expected: 1)`);

  if (oneCreateSucceeded && duplicatePendingCaught && countSettlements.stdout === '1') {
    console.log('✅ TEST 1 PASSED: Exactly one pending payment created; duplicate_pending raised for concurrent caller.\n');
  } else {
    console.error('❌ TEST 1 FAILED: Invariant violated for concurrent creation!');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Test 2: Confirm vs Cancel simultaneously on the same pending payment (ST11)
  // ---------------------------------------------------------------------------
  console.log('Test 2: Confirm vs Cancel simultaneously on the same pending payment (ST11)...');
  await resetFixtures();

  // Create 1 pending payment
  await runSql(`
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL "request.jwt.claims" to '{"sub": "${payerId}", "role": "authenticated"}';
    SELECT public.create_settlement('${groupId}', '33333333-3333-3333-3333-333333333333', '${payerId}', '${receiverId}', 60000, 'cash', 'ST11 Test');
    COMMIT;
  `);
  
  const idRes = await runSql(`
    SELECT id FROM public.settlements WHERE group_id = '${groupId}' AND amount_minor = 60000;
  `);
  const settlementId = idRes.stdout.trim();
  console.log(`  Created pending settlement: ${settlementId}`);

  const sessionConfirm = `
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL "request.jwt.claims" to '{"sub": "${receiverId}", "role": "authenticated"}';
    SELECT public.confirm_settlement('${settlementId}');
    COMMIT;
  `;

  const sessionCancel = `
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL "request.jwt.claims" to '{"sub": "${payerId}", "role": "authenticated"}';
    SELECT public.cancel_settlement('${settlementId}');
    COMMIT;
  `;

  const [resConfirm, resCancel] = await Promise.all([
    runSql(sessionConfirm),
    runSql(sessionCancel),
  ]);

  console.log(`  Confirm call: ${resConfirm.error ? `FAILED (${resConfirm.stderr})` : 'SUCCEEDED'}`);
  console.log(`  Cancel call:  ${resCancel.error ? `FAILED (${resCancel.stderr})` : 'SUCCEEDED'}`);

  const oneWinner = (!resConfirm.error && resCancel.error) || (resConfirm.error && !resCancel.error);
  const loserGotExpectedError = (resConfirm.error && resConfirm.stderr.includes('invalid_transition')) ||
                                 (resCancel.error && (resCancel.stderr.includes('invalid_transition') || resCancel.stderr.includes('settlement_not_allowed')));

  const finalSettlement = await runSql(`
    SELECT status, confirmed_at IS NOT NULL FROM public.settlements WHERE id = '${settlementId}';
  `);
  console.log(`  Final DB row state: ${finalSettlement.stdout}`);

  const activityCount = await runSql(`
    SELECT count(*) FROM public.activity_log WHERE ref_id = '${settlementId}' AND action IN ('settlement_confirmed', 'settlement_cancelled');
  `);
  console.log(`  Activity entries for transition: ${activityCount.stdout} (expected: 1)`);

  if (oneWinner && loserGotExpectedError && activityCount.stdout === '1') {
    console.log('✅ TEST 2 PASSED: Exactly one winner between confirm and cancel; loser rejected; exactly 1 activity log entry recorded.\n');
  } else {
    console.error('❌ TEST 2 FAILED: Invariant violated for concurrent confirm vs cancel!');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Test 3: Member leaving while pending payment is being created
  // ---------------------------------------------------------------------------
  console.log('Test 3: Member leaving while pending payment involving them is being created...');
  await resetFixtures();

  // Transaction 1 locks the group FOR UPDATE (as leave_group does), sets member status to left, and commits after a brief delay
  const sessionLeave = `
    BEGIN;
    SELECT 1 FROM public.groups WHERE id = '${groupId}' FOR UPDATE;
    UPDATE public.group_members SET status = 'left', left_at = now() WHERE group_id = '${groupId}' AND user_id = '${receiverId}';
    SELECT pg_sleep(0.3);
    COMMIT;
  `;

  // Transaction 2 tries to create settlement for receiver concurrently
  const sessionCreateWhileLeaving = `
    BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL "request.jwt.claims" to '{"sub": "${payerId}", "role": "authenticated"}';
    SELECT public.create_settlement('${groupId}', '44444444-4444-4444-4444-444444444444', '${payerId}', '${receiverId}', 75000, 'cash', 'Race with leave');
    COMMIT;
  `;

  const [resLeave, resCreate] = await Promise.all([
    runSql(sessionLeave),
    runSql(sessionCreateWhileLeaving),
  ]);

  console.log(`  Leave call:  ${resLeave.error ? `FAILED (${resLeave.stderr})` : 'SUCCEEDED'}`);
  console.log(`  Create call: ${resCreate.error ? `FAILED (${resCreate.stderr})` : 'SUCCEEDED'}`);

  const receiverNotMemberCaught = resCreate.error && resCreate.stderr.includes('receiver_not_member');

  // Invariant check: In NO case can there be a pending settlement referencing a non-active member
  const orphanCheck = await runSql(`
    SELECT count(*)
    FROM public.settlements s
    JOIN public.group_members gm
      ON s.group_id = gm.group_id
     AND (s.from_user = gm.user_id OR s.to_user = gm.user_id)
    WHERE s.group_id = '${groupId}'
      AND s.status = 'pending'
      AND gm.status <> 'active';
  `);
  console.log(`  Orphan pending payments referencing non-active member: ${orphanCheck.stdout} (must be 0)`);

  if (receiverNotMemberCaught && orphanCheck.stdout === '0') {
    console.log('✅ TEST 3 PASSED: Group locks ensure create_settlement waits for leave transaction and rejects with receiver_not_member (no orphan pending payment).\n');
  } else {
    console.error('❌ TEST 3 FAILED: Orphan pending payment created for non-active member!');
    process.exit(1);
  }


  // Final cleanup
  await runSql(`
    DELETE FROM public.groups WHERE id = '${groupId}';
    DELETE FROM public.profiles WHERE id IN ('${payerId}', '${receiverId}', '${adminId}');
    DELETE FROM auth.users WHERE id IN ('${payerId}', '${receiverId}', '${adminId}');
  `);

  console.log('================================================================');
  console.log('All Sub-phase 5.3 Concurrency Tests Passed Successfully!');
  console.log('================================================================');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
