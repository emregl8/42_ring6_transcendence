FROM nginx:1.29.4-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --chown=nginx:nginx public /usr/share/nginx/html

RUN find /usr/share/nginx/html -type f -exec chmod 644 {} \; && \
    find /usr/share/nginx/html -type d -exec chmod 755 {} \;

USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
