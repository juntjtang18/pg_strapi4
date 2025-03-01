#!/bin/bash

# API URL
API_URL="http://localhost:8080/api/categories"  # Make sure the collection is named 'categorys'

# Authorization Token
AUTH_TOKEN="Bearer dc4945c77a2cd9428207d9f003b2486983b7d14da22def2172ef7e86536322a3abff7a13818900870412fa993e7d1655aab96d5d6750fce3023af0aa4f389581c6632bd5352d1c715c36092699413f7d18aeab3007bfee25e7e7050de40739b783495dd57c5ad3a0cab6fc9ba1f412466267cfc1b102ba623ecedf9e736f33f3"

# categorys to be created
categories=(
  '{"name": "Expert Articles", "icon_name": "cat_expert_articles.jpg", "order": 1}'
  '{"name": "FAQ", "icon_name": "cat_faq.jpg", "order": 2}'
  '{"name": "Experience Sharing", "icon_name": "cat_experience_sharing.jpg", "order": 3}'
  '{"name": "Hot Post", "icon_name": "cat_hot_post.jpg", "order": 4}'

)

# Loop through the categorys array and send a POST request for each category
for category in "${categories[@]}"; do
  # Prepare the category data with the slug and localized fields
  category_data=$(echo "$category" | /usr/local/bin/jq -r '{
    data: {
      name: .name,
      icon_name: .icon_name,
      order: .order
    }
  }')

  # Send the POST request to create the category
  response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: $AUTH_TOKEN" \
    -d "$category_data")

  # Print the full response for debugging
  echo "Response: $response"

  # Check if the request was successful
  if [[ $(echo "$response" | jq -r '.data') != "null" ]]; then
    echo "category created: $category"
  else
    echo "Failed to create category: $category"
    echo "Response: $response"
  fi
done
