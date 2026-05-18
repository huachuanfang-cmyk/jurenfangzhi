// 直接测试 Supabase 连接和数据读取
import { createClient } from '@supabase/supabase-js';

const URL = 'https://upgudkwdnplzfylitqzq.supabase.co';
const KEY = 'sb_publishable_TNSfUp_ax3UDKxTI9PV6hA_kCb0mbPY';

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

// 模拟用户登录
const testEmail = '13798269736@163.com';
const testPwd = process.argv[2];  // 从命令行传入密码

if (!testPwd) {
  console.log('用法: node test_supabase.mjs <密码>');
  console.log('请提供你的登录密码作为参数');
  process.exit(1);
}

(async () => {
  // 1. 测试匿名连接
  console.log('1. 测试匿名连接...');
  const { data: d1, error: e1 } = await supabase.from('customers').select('count', { count: 'exact', head: true });
  console.log('   结果:', e1 ? '失败: ' + e1.message : '成功! 客户数=' + d1?.[0]?.count);

  // 2. 登录
  console.log('2. 尝试登录 ' + testEmail + '...');
  const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({ email: testEmail, password: testPwd });
  if (loginErr) {
    console.log('   登录失败:', loginErr.message);
    process.exit(1);
  }
  console.log('   登录成功! 用户:', loginData.user?.email);
  console.log('   角色:', loginData.session?.user?.role);

  // 3. 登录后查询
  console.log('3. 登录后查询数据...');
  const tables = ['customers', 'factories', 'materials', 'orders', 'fg_rolls'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(`   ${t}: ${error ? '✗ ' + error.message : '✓ ' + (data?.[0]?.count || 0) + ' 条'}`);
  }

  // 4. 尝试实际读取数据
  console.log('4. 尝试实际读取客户数据...');
  const { data: custs, error: custErr } = await supabase.from('customers').select('*');
  if (custErr) {
    console.log('   失败:', custErr.message);
  } else {
    console.log('   成功! 客户列表:', custs?.map(c => c.nm).join(', '));
  }
})();
