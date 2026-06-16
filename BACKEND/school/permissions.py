from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Autorise uniquement les super-administrateurs de la plateforme (role='admin')."""
    message = "Accès réservé à l'administration."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) == 'admin'
        )
