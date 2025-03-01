#!/bin/bash

API_URL="http://localhost:8080/api/categories"
AUTH_TOKEN="Bearer dc4945c77a2cd9428207d9f003b2486983b7d14da22def2172ef7e86536322a3abff7a13818900870412fa993e7d1655aab96d5d6750fce3023af0aa4f389581c6632bd5352d1c715c36092699413f7d18aeab3007bfee25e7e7050de40739b783495dd57c5ad3a0cab6fc9ba1f412466267cfc1b102ba623ecedf9e736f33f3"

echo "Fetching all categories..."
categories=$(curl -s -X GET "$API_URL" -H "Authorization: $AUTH_TOKEN" | jq -r '.data | map(.id) | @sh')

if [[ -z "$categories" ]]; then
  echo "No categories found."
  exit 0
fi

for id in $categories; do
  echo "Deleting category with ID: $id"
  curl -s -X DELETE "$API_URL/$id" \
    -H "Authorization: $AUTH_TOKEN" \
    -H "Content-Type: application/json"
done

echo "All categories deleted."
