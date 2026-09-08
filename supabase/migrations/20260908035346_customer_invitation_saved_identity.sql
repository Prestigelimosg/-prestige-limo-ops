-- Invited access uses the exact saved CRM identity; existing saved emails remain intact.
-- Non-invitation sign-in/recovery still requires a real verified email. No existing records are rewritten.
alter table public.customer_access_principals
  add column invitation_identity_key text;
alter table public.customer_access_principals
  alter column normalized_email drop not null;
alter table public.customer_access_principals
  add constraint customer_access_principals_invitation_identity_key unique (invitation_identity_key),
  add constraint customer_access_principals_invitation_identity_check check (
    invitation_identity_key is null
    or (principal_role = 'pa' and invitation_identity_key ~ '^pa:[1-9][0-9]*:[1-9][0-9]*:root$')
    or (principal_role = 'boss' and invitation_identity_key ~ '^boss:[1-9][0-9]*:[1-9][0-9]*:[1-9][0-9]*$')
  ),
  add constraint customer_access_principals_identity_required_check check (
    normalized_email is not null or invitation_identity_key is not null
  );
