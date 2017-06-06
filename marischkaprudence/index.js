'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const template = require('./template');

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
    return libingester.util.fetch_html(uri).then(($profile) => {
        const asset = new libingester.NewsArticle();
        const author = $profile('.pauthor a').first();
        const category = $profile('.meta_categories');

        // clear tags (body)
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $profile(tag).removeAttr(attr));
        category.find("a").get().map((tag) => clean_attr(tag));

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
                const image = libingester.util.download_img($profile(this), BASE_URI);
                image.set_title(title);
                hatch.save_asset(image);
                this.attribs['data-libingester-asset-id'] = image.asset_id;
            }
        });

        const body = $profile('.post-body').first();

        // remove elements and comments
        body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        //clean tags
        body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));
        body.find('.BLOG_video_class').parent().remove(); //Delete videos

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
    libingester.util.fetch_html(RSS_URI).then(($) => {
        const objects = $('entry:nth-child(-n+18)').map(function() {
            return {
                updated: $(this).find('updated').text(),
                uri: $(this).find('link[rel="alternate"]').attr('href'),
            }
        }).get();
        return Promise.all(objects.map((obj) => ingest_article(hatch, obj)))
            .then(() => hatch.finish());
    });
}

main();