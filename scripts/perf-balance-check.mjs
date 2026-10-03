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
  console.log('=== BS9 Performance Check: 50 members and 5,000 expenses ===');

  const groupId = '77777777-7777-7777-7777-777777777777';
  const memberCount = 50;
  const expenseCount = 5000;

  console.log(`Setting up group with ${memberCount} members...`);

  await runSql(`
    delete from public.groups where id = '${groupId}';
    delete from auth.users where email like 'perf_user_%@example.com';

    -- Insert 50 users
    insert into auth.users (id, email)
    select ('70000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
           'perf_user_' || i || '@example.com'
      from generate_series(1, ${memberCount}) as i
    on conflict do nothing;

    -- Insert group
    insert into public.groups (id, name, created_by)
    values ('${groupId}', 'Perf Test Group', '70000000-0000-0000-0000-000000000001');

    -- Insert 50 group members
    insert into public.group_members (group_id, user_id, role, status)
    select '${groupId}',
           ('70000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
           case when i = 1 then 'admin' else 'member' end,
           'active'
      from generate_series(1, ${memberCount}) as i;
  `);

  console.log(`Generating ${expenseCount} expenses with splits in bulk...`);

  await runSql(`
    -- Insert 5000 expenses
    insert into public.expenses (id, group_id, amount_minor, paid_by, split_type, expense_date, created_by)
    select ('80000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
           '${groupId}',
           10000, -- ₹100
           ('70000000-0000-0000-0000-' || lpad(((i % ${memberCount}) + 1)::text, 12, '0'))::uuid,
           'equal',
           current_date,
           ('70000000-0000-0000-0000-' || lpad(((i % ${memberCount}) + 1)::text, 12, '0'))::uuid
      from generate_series(1, ${expenseCount}) as i;

    -- Insert expense splits (each expense split between 2 members: 5000 paise each)
    insert into public.expense_splits (expense_id, user_id, share_minor)
    select ('80000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
           ('70000000-0000-0000-0000-' || lpad(((i % ${memberCount}) + 1)::text, 12, '0'))::uuid,
           5000
      from generate_series(1, ${expenseCount}) as i
    union all
    select ('80000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
           ('70000000-0000-0000-0000-' || lpad((((i + 1) % ${memberCount}) + 1)::text, 12, '0'))::uuid,
           5000
      from generate_series(1, ${expenseCount}) as i;
  `);

  console.log('Running timed get_group_balances calls...');

  // Warmup run
  await runSql(`
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
    select public.get_group_balances('${groupId}');
  `);

  // Timed runs (5 iterations)
  const timings = [];
  for (let iter = 1; iter <= 5; iter++) {
    const start = performance.now();
    const resultJson = await runSql(`
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
      select public.get_group_balances('${groupId}');
    `);
    const duration = performance.now() - start;
    timings.push(duration);
    console.log(`Run ${iter}: ${duration.toFixed(2)} ms`);
  }

  const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
  console.log(`\nAverage time across 5 runs: ${avgTime.toFixed(2)} ms`);

  // Clean up
  console.log('Cleaning up test data...');
  await runSql(`
    delete from public.groups where id = '${groupId}';
    delete from auth.users where email like 'perf_user_%@example.com';
  `);

  console.log('BS9 check complete.');
}

main().catch((err) => {
  console.error('Performance check failed:', err);
  process.exit(1);
});
