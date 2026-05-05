from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Eleves, CodeLiaison

@receiver(post_save, sender=Eleves)
def create_code_liaison(sender, instance, created, **kwargs):
    if created:
        CodeLiaison.objects.create(id_eleve=instance)
