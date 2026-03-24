import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Clear agency_name for the current user
  await base44.auth.updateMe({ agency_name: null });

  return Response.json({ success: true, message: 'agency_name cleared' });
});