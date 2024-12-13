#!/bin/bash

extension_dir="extension"
tmp_dir="tmp"
current_dir_name="$(basename "$(pwd)")"
archive_dir="${tmp_dir}/${current_dir_name}"
zip_name="${current_dir_name}.zip"

# 除外するファイルやディレクトリのパターンを定義
exclude_patterns=(
  "*/*archive.sh"
  "*/*.DS_Store"
  "*/*.git/*"
  "*/*.gitignore"
)

# 除外パターンを引数として渡す
exclude_args=""
for pattern in "${exclude_patterns[@]}"; do
  exclude_args+=" -x $pattern"
done

mkdir -p "${archive_dir}"
cp -r "$extension_dir"/* "${archive_dir}/"
cp -r "LICENSE" "${archive_dir}/"

cd "tmp" || exit
zip -r -X "../$zip_name" . $exclude_args
cd ..

rm -rf "tmp"