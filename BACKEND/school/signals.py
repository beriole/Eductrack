from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Eleves, CodeLiaison, Cours, Epreuves


@receiver(post_save, sender=Eleves)
def create_code_liaison(sender, instance, created, **kwargs):
    if created:
        CodeLiaison.objects.create(id_eleve=instance)


@receiver(post_save, sender=Cours)
def notifier_publication_cours(sender, instance, **kwargs):
    """Quand un cours passe en 'publié', notifie les élèves du niveau concerné."""
    if instance.statut == 'publie' and not instance.notif_publication_envoyee:
        from .utils import notifier_eleves_nouveau_contenu
        notifier_eleves_nouveau_contenu(instance, 'cours')
        # update() pour ne pas re-déclencher le signal (pas de récursion).
        Cours.objects.filter(pk=instance.pk).update(notif_publication_envoyee=True)


@receiver(post_save, sender=Epreuves)
def notifier_creation_epreuve(sender, instance, **kwargs):
    """Quand un enseignant crée/importe un sujet, annale ou exercice (statut actif),
    notifie les élèves du niveau. On ignore les épreuves auto-générées (révision du
    jour, tests d'orientation, exercices IA) qui n'ont pas d'enseignant."""
    if (instance.id_enseignant_id is not None
            and instance.statut == 'actif'
            and not instance.notif_publication_envoyee):
        from .utils import notifier_eleves_nouveau_contenu
        notifier_eleves_nouveau_contenu(instance, 'epreuve')
        Epreuves.objects.filter(pk=instance.pk).update(notif_publication_envoyee=True)
