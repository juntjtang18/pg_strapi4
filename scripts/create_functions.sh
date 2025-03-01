#!/bin/bash

# API URL
API_URL="http://localhost:8080/api/functions"  # Make sure the collection is named 'functions'

# Authorization Token
AUTH_TOKEN="Bearer dc4945c77a2cd9428207d9f003b2486983b7d14da22def2172ef7e86536322a3abff7a13818900870412fa993e7d1655aab96d5d6750fce3023af0aa4f389581c6632bd5352d1c715c36092699413f7d18aeab3007bfee25e7e7050de40739b783495dd57c5ad3a0cab6fc9ba1f412466267cfc1b102ba623ecedf9e736f33f3"

# Functions to be created
functions=(
  '{"name": "Emotional Development", "icon_name": "func_emotion_dev.jpg", "order": 1}'
  '{"name": "School & Social Life", "icon_name": "func_school_social_life.jpg", "order": 2}'
  '{"name": "Growth & Milestones", "icon_name": "func_growth_milestone.jpg", "order": 3}'
  '{"name": "Parenting Resources", "icon_name": "func_parenting_resource.jpg", "order": 4}'
  '{"name": "Child Experts", "icon_name": "func_child_experts.jpg", "order": 5}'
  '{"name": "Nutrition for Kids", "icon_name": "func_nutrition_for_kids.jpg", "order": 6}'
)

# Loop through the functions array and send a POST request for each function
for function in "${functions[@]}"; do
  # Prepare the function data with the slug and localized fields
  function_data=$(echo "$function" | jq -r '{
    data: {
      name: .name,
      icon_name: .icon_name,
      order: .order
    }
  }')

  # Send the POST request to create the function
  response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: $AUTH_TOKEN" \
    -d "$function_data")

  # Print the full response for debugging
  echo "Response: $response"

  # Check if the request was successful
  if [[ $(echo "$response" | jq -r '.data') != "null" ]]; then
    echo "Function created: $function"
  else
    echo "Failed to create function: $function"
    echo "Response: $response"
  fi
done
