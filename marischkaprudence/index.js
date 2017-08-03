'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = "http://marischkaprudence.blogspot.com.br";
const RSS_URI = "http://marischkaprudence.blogspot.com.br/feeds/posts/default";

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'iframe',
    'noscript',
    'script',
    'style',
    '.post-body #related-posts',
];

// clean attr (tag)
const REMOVE_ATTR = [
    'border',
    'dir',
    'height',
    'imageanchor',
    'lang',
    'rel',
    'sizes',
    'src',
    'srcset',
    'style',
    'trbidi',
    'width',
];

// clean attr (tag)
const CLEAN_TAGS = [
    'a',
    'b',
    'br',
    'div',
    'i',
    'img',
    'span',
    'table',
];

function ingest_article(hatch, obj) {
    const uri = obj.uri;
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.BlogArticle();
        const author = $('.pauthor a').first().text();
        const date_published = new Date(Date.parse(obj.published));
        const date_updated = new Date(Date.parse(obj.updated));
        const title = $('meta[property="og:title"]').attr('content');
        const body = $('.post-body').first();
        const category = $('.meta_categories');

        let tags = $('.meta_categories a').map(function() {
            return $(this).text();
        }).get();

        // clear tags (body)
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        category.find("a").get().map((tag) => clean_attr(tag));

        //Main image
        const main_img = $('meta[property="og:image"]').attr('content');
        const main_image = libingester.util.download_image(main_img);
        main_image.set_title(title);
        hatch.save_asset(main_image);

        //remove main image from body
        $('.post-body img').first().remove();

        // Download videos
        body.find('iframe').map((i,elem) => {
            const uri_thumb = $(elem).attr('data-thumbnail-src');
            const src = $(elem).attr('src');
            const domain = url.parse(src).hostname;
            const parent = $(elem).parent();
            if (domain == 'www.youtube.com') {
                const video = libingester.util.get_embedded_video_asset(parent, src);
                const thumb = libingester.util.download_image(uri_thumb);
                thumb.set_title(title);
                video.set_title(title);
                video.set_thumbnail(thumb);
                hatch.save_asset(video);
                hatch.save_asset(thumb);
            } else {
                $(elem).remove();
            }
        });

        // Download images
        body.find('img').map(function() { // Put images in <figure>
           let parent= $(this).parent().parent();
           let figure = $('<figure></figure>');
           let figcaption = '';

           if(parent[0].name == 'div'){
              parent.replaceWith(figure);
              $(figure).append($(this));
           }
           else if(parent[0].name == 'td') {
              let tbody = $(this).parent().parent().parent().parent();
              let caption= tbody.children()[1].children[0].children[0].children[0].data;
              let table = tbody.parent();
              figcaption = $("<figcaption>" + caption + "</figcaption>");
              figure.append($(this).clone(), figcaption);
              table.replaceWith(figure);
              $(this).remove();
            }
        });

        body.find('img').map(function() {
            if (this.attribs.src) {
                const image = libingester.util.download_img($(this));
                this.attribs['data-libingester-asset-id'] = image.asset_id;
                image.set_title(title);
                hatch.save_asset(image);
            }
            else{
               $(this).remove();
            }
        });

        // remove elements and comments
        body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        //clean tags
        body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));
        body.find('.BLOG_video_class').parent().remove(); //Delete videos

        asset.set_title(title);
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(date_updated);
        asset.set_date_published(date_published);
        asset.set_license('Proprietary');
        asset.set_author(author);
        asset.set_synopsis(body.text().substring(0, 140));
        asset.set_thumbnail(main_image);
        asset.set_main_image(main_image);
        asset.set_body(body);
        asset.set_tags(tags);
        asset.set_read_more_text('Artikel asli di wwww.marischkaprudence.blogspot.com');
        asset.set_custom_scss(`
            $primary-light-color: #B7B7B7;
            $primary-medium-color: #95989A;
            $primary-dark-color: #2E2E2E;
            $accent-light-color: #31AB6F;
            $accent-dark-color: #247E51;
            $background-light-color: #FFFFFF;
            $background-dark-color: #E5E5E5;
            $title-font: 'Raleway';
            $body-font: 'Droid Serif';
            $display-font: 'Raleway';
            $logo-font: 'Droid Serif';
            $context-font: 'Raleway';
            $support-font: 'Raleway';
            @import '_default';
        `);

        asset.render();
        hatch.save_asset(asset);

    }).catch((err) => {
        console.log(err);
    });
}

function main() {
    const hatch = new libingester.Hatch('marischkaprudence', 'id');
    libingester.util.fetch_html(RSS_URI).then(($) => {
        const objects = $('entry:nth-child(-n+24)').map(function() {
            return {
                published: $(this).find('published').text(),
                updated: $(this).find('updated').text(),
                uri: $(this).find('link[rel="alternate"]').attr('href'),
            }
        }).get();
        return Promise.all(objects.map((obj) => ingest_article(hatch, obj)))
            .then(() => hatch.finish());
    });
}

main();
