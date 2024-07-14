#!/bin/bash

current_dir=$(pwd)

rm -rf out
next build
rm -rf "../firebase/public"
mv out "../firebase/public"
cd "../firebase"
firebase deploy
