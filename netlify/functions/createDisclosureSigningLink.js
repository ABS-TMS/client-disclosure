// netlify/functions/createDisclosureSigningLink.js
//
// Generates a one-time signing token for the client and returns the
// shareable URL. Called after the agent has already signed in-app.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://petfaclkzdudyvyhifaj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_H6IVVyBLqTTsub1zH_igSw_EqimRQ9Y';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { disclosureId, agentSignatureDataUrl } = payload;
  if (!disclosureId || !agentSignatureDataUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'disclosureId and agentSignatureDataUrl are required' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    const { error: sigError } = await supabase.rpc('save_agent_disclosure_signature', {
      p_id: disclosureId,
      p_agent_signature_data_url: agentSignatureDataUrl,
    });

    if (sigError) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not save agent signature: ' + sigError.message }) };
    }

    const { data: tokenRow, error: tokenError } = await supabase
      .rpc('create_disclosure_signing_token', { p_disclosure_id: disclosureId, p_signer_role: 'client' })
      .single();

    if (tokenError || !tokenRow) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not create signing link: ' + (tokenError?.message || 'unknown error') }) };
    }

    const siteUrl = process.env.URL || ('https://' + event.headers.host);
    const signingUrl = `${siteUrl}/sign-disclosure.html?token=${tokenRow.token}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, signing_url: signingUrl }),
    };
  } catch (error) {
    console.error('createDisclosureSigningLink error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
