import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='TaskList',
            fields=[
                ('id', models.UUIDField(editable=False, primary_key=True, serialize=False)),
                ('format_version', models.PositiveIntegerField(default=1)),
                ('item_version', models.PositiveIntegerField(default=1)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('content', models.TextField()),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='task_lists', to='accounts.user')),
            ],
            options={
                'db_table': 'tasks_tasklist',
            },
        ),
        migrations.CreateModel(
            name='Task',
            fields=[
                ('id', models.UUIDField(editable=False, primary_key=True, serialize=False)),
                ('format_version', models.PositiveIntegerField(default=1)),
                ('item_version', models.PositiveIntegerField(default=1)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('content', models.TextField()),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tasks', to='accounts.user')),
                ('task_list', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='tasks', to='tasks.tasklist')),
            ],
            options={
                'db_table': 'tasks_task',
                'indexes': [models.Index(fields=['user', 'task_list'], name='tasks_task_user_id_9e5655_idx')],
            },
        ),
    ]
