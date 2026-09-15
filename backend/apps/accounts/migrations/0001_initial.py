import apps.accounts.managers
import django.contrib.auth.validators
import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='User',
            fields=[
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('username', models.CharField(max_length=32, unique=True, validators=[django.contrib.auth.validators.UnicodeUsernameValidator()])),
                ('srp_salt', models.CharField(max_length=128)),
                ('srp_verifier', models.CharField(max_length=512)),
                ('identity_public_key', models.TextField()),
                ('wrapped_private_key', models.TextField(blank=True, default='')),
                ('storage_used', models.BigIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('date_joined', models.DateTimeField(auto_now_add=True)),
                ('last_login', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'db_table': 'accounts_user',
            },
            managers=[
                ('objects', apps.accounts.managers.UserManager()),
            ],
        ),
        migrations.CreateModel(
            name='Session',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('refresh_hash', models.CharField(max_length=64, unique=True)),
                ('device_name', models.CharField(blank=True, default='', max_length=128)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, default='', max_length=256)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('last_used_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sessions', to='accounts.user')),
            ],
            options={
                'db_table': 'accounts_session',
                'ordering': ['-last_used_at'],
            },
        ),
        migrations.CreateModel(
            name='SRPSession',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('server_private', models.CharField(max_length=512)),
                ('server_public', models.CharField(max_length=512)),
                ('client_public', models.CharField(blank=True, default='', max_length=512)),
                ('purpose', models.CharField(choices=[('login', 'login'), ('reauth', 'reauth')], default='login', max_length=16)),
                ('consumed', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='srp_sessions', to='accounts.user')),
            ],
            options={
                'db_table': 'accounts_srp_session',
                'indexes': [models.Index(fields=['user', 'purpose', 'consumed'], name='accounts_sr_user_id_4b5b00_idx')],
            },
        ),
    ]
