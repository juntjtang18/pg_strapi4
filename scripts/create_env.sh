echo "Creating .env file in $(pwd)..."
cat << EOF > .env
HOST=0.0.0.0
PORT=8080
APP_KEYS=qasqVyZOf8KJ/rgYYbE4/w==,JmDepwXWOjGxfNHgDhg43w==,ANPSI9a+z4WmnfBOaHxlHg==,V6CIUf0vcj/GJ8Gt4306TA==
API_TOKEN_SALT=Xtz+i5IPW3ApE3eIsYQF9w==
ADMIN_JWT_SECRET=4mvOKZ35kjlNVjjxB/+0xQ==
TRANSFER_TOKEN_SALT=O35AEehAeD7N+1h6sS73Lw==
# IS_LOCAL=true # You can uncomment this if your Strapi setup uses it

# Database
DATABASE_CLIENT=postgres
DATABASE_HOST=${DB_HOST_SOCKET} # Use the variable for consistency
DATABASE_PORT=5432
DATABASE_NAME=${DB_NAME}
DATABASE_USERNAME=${DB_APP_USER}
DATABASE_PASSWORD=${DB_APP_PASSWORD} # Use the app user's password
DATABASE_SSL=false # Set to true if your proxy/connection requires SSL
JWT_SECRET=zNFVknwhnld60t/32I7iPA==
EOF
echo ".env file created."
echo "--- .env File Creation Complete ---"

