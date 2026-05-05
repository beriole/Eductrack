from django.contrib import admin
from django.urls import path
from .import views

urlpatterns = [
    path('',views.home, name='accueil'),
    path('login/',views.login,name='connexion'),
    
]