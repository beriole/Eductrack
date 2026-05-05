from django.http import *
from django.shortcuts import render
def home(request):
    return  JsonResponse({"message": "beriole bienvenue sur notre site",
                           "data":12,
                            "donnee":"beriole your the best" })
def login(request):
    return render(request,'home.html')