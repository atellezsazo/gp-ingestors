'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const url = require('url');
const template = require('./template');

const BASE_URI = 'http://bk.asia-city.com/';

/**
 * utilities
 *
 * A utility library
 *
 * @param {Objet} $ Instance to manipulate the DOM of the post given
 */
function utilities($) {
    /** array of tags to be removed */
    const _remove_elements = ['iframe', 'script'];

    /** array of attributes to be removed */
    const _remove_attr = [
        'alt',
        'class',
        'dir',
        'height',
        'style',
        'width'
    ];

    /** array of tags to be cleaned */
    const _clear_tags = [
        'div',
        'em',
        'h1, h2, h3, h4, h5, h6',
        'img',
        'ol',
        'p',
        'span',
        'strong',
        'u',
        'ul'
    ];

    /** Cleans the HTML element to return a string */
    const _cleaning_tags = (tags) => {
        return tags.map((id, tag) => {
            return $(tag).text();
        }).get().join(', ');
    };

    /** remove elements and comments */
    const _cleaning_body = (content) => {
        content.contents().filter((index, node) => node.type === 'comment').remove();
        content.find(_remove_elements.join(',')).remove();
        content.find(_clear_tags.join(',')).map(function(index, elem) {
            _remove_attr.map((attr) => {
                delete elem.attribs[attr]
            })
        });
        return content;
    };

    /** Utility to truncate the text of the synopsis */
    const _truncate = function(str, length) {
        let _length = length || 150;
        let _end = '...';

        if (str.length > _length) {
            str = str.substring(0, _length - _end.length) + _end;
        }
        return str;
    };

    return {
        /** object with the processed metadata of a post  */
        post_metadata: () => {
            return {
                author: $('.author a').first().text(),
                body: _cleaning_body($('.pane-content #dvPage').first()),
                cover: $('meta[property="og:image"]').attr('content'),
                date: new Date(Date.parse($('.published-date').first().text())),
                synopsis: $('meta[name="description"]').attr('content'),
                tags: _cleaning_tags($('.node_terms > li > a')),
                title: $('meta[property="og:title"]').attr('content'),
                batch_gallery: $('.flexslider ul.slides li img')
            }
        },

        /** render and save the content */
        render_template: (hatch, asset, template, post_data) => {
            const content = mustache.render(template, post_data);
            asset.set_document(content);
            hatch.save_asset(asset);
        },

        /** remove_attr */
        remove_attr: _remove_attr
    }
}

/**
 * ingest_article
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri 
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const util = utilities($);
        const asset = new libingester.NewsArticle();
        const post = util.post_metadata();
        post.template = template.article_template;

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(post.date);
        asset.set_section(post.tags);
        asset.set_synopsis(post.synopsis);
        asset.set_title(post.title);

        // download cover
        if (post.cover) {
            const main_image = libingester.util.download_image(post.cover);
            main_image.set_title(post.title);
            hatch.save_asset(main_image);
            post.thumbnail = main_image;
            post.main_image = main_image;
            asset.set_thumbnail(post.thumbnail);
        }

        // download images
        post.body.find('img').map((id, img) => {
            if (img.attribs.src) {
                const image = libingester.util.download_img($(img), BASE_URI);
                image.set_title(post.title);
                hatch.save_asset(image);
            }
        });

        // downlaad galleries
        if (post.batch_gallery) {
            post.gallery = [];
            post.batch_gallery.get().map((img) => {
                if (img.attribs.src) {
                    const image = libingester.util.download_img($(img), BASE_URI);
                    image.set_title(post.title);
                    hatch.save_asset(image);
                    post.gallery.push({id: image.asset_id});
                }
            });
            post.template = template.gallery_template
        }

        util.render_template(hatch, asset, post.template, {
            author: post.author,
            body: post.body.html(),
            gallery: post.gallery,
            main_image: post.main_image,
            post_tags: post.tags,
            published: post.date.toLocaleDateString(),
            title: post.title
        });
    }).catch((err) => {
        return ingest_article(hatch, uri);
    });
}

/**
 * main method
 *
 * The main method to initialize the ingestion of the given site
 *
 * @return {Promise}
 */
function main() {
    const hatch = new libingester.Hatch();
    libingester.util.fetch_html(BASE_URI).then(($) => {
        const news = $('.view-news-feed .views-field-title a').get().map(anchor => {
            return url.resolve(BASE_URI, anchor.attribs.href);
        });
        return news;
    }).then((batch_links) => {
        Promise.all(batch_links.map(uri => ingest_article(hatch, uri))).then(() => {
            return hatch.finish();
        });
    });
}

main();
