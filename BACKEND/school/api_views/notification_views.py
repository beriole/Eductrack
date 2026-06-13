from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from school.models import Notifications
from school.serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Notifications.objects.filter(id_utilisateur=self.request.user)
        lue = self.request.query_params.get('lue')
        if lue is not None:
            qs = qs.filter(lue=lue.lower() == 'true')
        return qs


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_notification):
        try:
            notif = Notifications.objects.get(
                id_notification=id_notification,
                id_utilisateur=request.user,
            )
        except Notifications.DoesNotExist:
            return Response({"error": "Notification introuvable."}, status=status.HTTP_404_NOT_FOUND)

        notif.lue = True
        notif.date_lecture = timezone.now()
        notif.save(update_fields=['lue', 'date_lecture'])
        return Response({"message": "Notification marquée comme lue."}, status=status.HTTP_200_OK)


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        count = Notifications.objects.filter(
            id_utilisateur=request.user, lue=False
        ).update(lue=True, date_lecture=timezone.now())
        return Response({"message": f"{count} notifications marquées comme lues."}, status=status.HTTP_200_OK)


class NotificationCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notifications.objects.filter(id_utilisateur=request.user, lue=False).count()
        return Response({"non_lues": count}, status=status.HTTP_200_OK)
