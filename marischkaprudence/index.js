'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const template = require('./template');
const url = require('url');

const base_uri = "http://marischkaprudence.blogspot.com.br";
const rss_uri = "http://marischkaprudence.blogspot.com.br/feeds/posts/default";

// Remove elements (body)
const remove_elements = [
    'iframe',
    'noscript',
    'script',
    'style',
    '.post-body #related-posts',
];

// clean attr (tag)
const remove_attr = [
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
const clear_tags = [
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
    return libingester.util.fetch_html(uri).then(($profile) => {
        const asset = new libingester.NewsArticle();
        const author = $profile('.pauthor a').first();
        const category = $profile('.meta_categories');

        // clear tags (body)
        category.find('a').map(function() {
            for (const attr of remove_attr) {
                delete this.attribs[attr];
            }
        });

        const date_published = new Date(Date.parse(obj.updated));
        const section = $profile('.meta_categories').text();
        const title = $profile('meta[property="og:title"]').attr('content');

        // Set title section
        asset.set_title(title);
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(date_published);
        asset.set_section(section);

        //Main image
        const main_img = $profile('meta[property="og:image"]').attr('content');
        const main_image = libingester.util.download_image(main_img);
        main_image.set_title(title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);

        // Download images
        $profile('.post-body img').map(function() {
            if (this.attribs.src) {
                const image = libingester.util.download_img($profile(this), base_uri);
                image.set_title(title);
                hatch.save_asset(image);
                this.attribs['data-libingester-asset-id'] = image.asset_id;
            }
        });

        const body = $profile('.post-body').first();

        // remove elements (body)
        for (const element of remove_elements) {
            body.find(element).remove();
        }

        body.find('.BLOG_video_class').parent().remove(); //Delete videos

        // clear tags (body)
        for (const tag of clear_tags) {
            body.find(tag).map(function() {
                for (const attr of remove_attr) {
                    delete this.attribs[attr];
                }
            });
        }

        asset.set_synopsis(body.text().substring(0, 140));

        const content = mustache.render(template.structure_template, {
            category: category,
            author: author,
            date_published: date_published,
            title: title,
            body: body.html(),
        });

        // save document
        asset.set_document(content);
        hatch.save_asset(asset);
    }).catch((err) => {
        console.log(err);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    const posts = libingester.util.fetch_html(rss_uri).then(($) => {
        const objects = $('entry:nth-child(-n+18)').map(function() {
            return {
                updated: $(this).find('updated').text(),
                uri: $(this).find('link[rel="alternate"]').attr('href'),
            }
        }).get();
        return Promise.all(objects.map((obj) => ingest_article(hatch, obj))).then(values => {
            return hatch.finish();
        });
    });
}

main();