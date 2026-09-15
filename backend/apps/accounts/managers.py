from django.contrib.auth.base_user import BaseUserManager


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, username, **extra_fields):
        if not username:
            raise ValueError("username is required")
        user = self.model(username=self.model.normalize_username(username), **extra_fields)
        user.set_unusable_password()
        user.save(using=self._db)
        return user
