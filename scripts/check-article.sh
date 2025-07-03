#!/bin/bash

# Configuration
BASE_URL="http://localhost:8080"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OCwiaWF0IjoxNzUxMzI2OTM0LCJleHAiOjE3NTM5MTg5MzR9.QJ3-ZJbOVjZfL68vO4DUSfFEUM0W6l3wfFbyDRdYEmo"
PAGE_SIZE=100

# Function to fetch articles and check functions
check_articles() {
  local page=1
  local total=0
  local page_count=1
  local articles_without_functions=0

  echo "Starting check at $(date)"
  while [ "$page" -le "$page_count" ]; do
    url="${BASE_URL}/api/articles?pagination[page]=${page}&pagination[pageSize]=${PAGE_SIZE}&populate=functions&locale=en"
    echo "Fetching page $page of $page_count: $url"
    response=$(curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$url")

    # Check if response is valid JSON
    if ! echo "$response" | jq -e . >/dev/null 2>&1; then
      echo "Error: Invalid JSON response from $url"
      echo "Raw response: $response"
      return 1
    fi

    # Extract pagination info
    total=$(echo "$response" | jq -r '.meta.pagination.total // 0')
    page_count=$(echo "$response" | jq -r '.meta.pagination.pageCount // 1')

    # Process articles
    echo "$response" | jq -c '.data[]' | while read -r article; do
      if [ -n "$article" ]; then
        id=$(echo "$article" | jq -r '.id // "N/A"')
        title=$(echo "$article" | jq -r '.attributes.title // "N/A"')
        functions=$(echo "$article" | jq -r '.attributes.functions.data // null')
        if [ "$functions" = "null" ] || [ "$(echo "$functions" | jq 'length')" -eq 0 ]; then
          echo "Article ID $id (Title: $title) has no functions"
          ((articles_without_functions++))
        fi
      fi
    done

    ((page++))
  done

  if [ "$total" -eq 0 ]; then
    echo "No articles found or API request failed."
  else
    echo "Checked $total articles across $page_count pages."
    if [ "$articles_without_functions" -eq 0 ]; then
      echo "No articles found without functions."
    else
      echo "Found $articles_without_functions articles without functions."
    fi
  fi
  echo "Finished at $(date)"
}

# Run the check
check_articles

