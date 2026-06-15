from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Pagination par défaut.

    Garde PAGE_SIZE=20 mais autorise le client à demander une page plus large
    via `?page_size=...` (plafonné). Utile pour les écrans qui regroupent les
    contenus par matière et ont besoin de tout charger d'un coup.
    """
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 300
