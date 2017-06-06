'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const url = require('url');
const template = require('./template');

const BASE_URI = "http://dianarikasari.blogspot.com";

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'iframe',
    'noscript',
    'script',
    'style',
];

// clean attr (tag)
const REMOVE_ATTR = [
    'border',
    'class',
    'dir',
    'height',
    'id',
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
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'i',
    'img',
    'span',
    'table',
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        $profile('.date-outer').map(function() {
            const date_published = new Date(Date.parse($profile(this).find('.date-header span').text()));
            const title = $profile(this).find('.post-title').text();

            // Ingest video post
            const videos = $profile(this).find('.post-body iframe').first()[0] || $profile(this).find('.post-body script').first()[0];
            if (videos) {
                for (const video_iframe of video_iframes) {
                    const video_url = videos.attribs.src;
                    if (video_url.includes(video_iframe)) {
                        const full_uri = url.format(video_url, { search: false })
                        const video_asset = new libingester.VideoAsset();
                        video_asset.set_canonical_uri(full_uri);
                        video_asset.set_last_modified_date(date_published);
                        video_asset.set_title(title);
                        video_asset.set_download_uri(full_uri);
                        hatch.save_asset(video_asset);
                        return;
                    }
                }
            } else {
                const asset = new libingester.NewsArticle();
                const author = $profile(this).find('.post-author a').first();
                const category = $profile(this).find('.post-labels a').map(function() {
                    return $profile(this);
                }).get();

                const section = $profile(this).find('.post-labels').text().replace('Labels:', '');

                // Set title section
                asset.set_title(title);
                asset.set_canonical_uri(uri);
                asset.set_last_modified_date(date_published);
                asset.set_section(section);

                // Download images
                let isFirst = true;
                $profile(this).find('.post-body img').map(function() {
                    if (this.attribs.src) {
                        const image = libingester.util.download_img(this, BASE_URI);
                        image.set_title(title);
                        hatch.save_asset(image);

                        if (isFirst) {
                            asset.set_thumbnail(image);
                            isFirst = false;
                        }
                        this.attribs['data-libingester-asset-id'] = image.asset_id;
                    }
                });

                const body = $profile(this).find('.post-body').first();
                asset.set_synopsis(body.text().substring(0, 140));

                // remove elements and comments
                body.contents().filter((index, node) => node.type === 'comment').remove();
                body.find(REMOVE_ELEMENTS.join(',')).remove();

                //clean tags
                const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $profile(tag).removeAttr(attr));
                body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));

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
            }
        });
    }).catch((err) => {
        console.log("Ingestor: ", err);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    new Promise((resolve, reject) => {
        libingester.util.fetch_html(BASE_URI).then(($posts) => {
            const posts_links = $posts('.post-title a').map(function() {
                const uri = $posts(this).attr('href');
                return url.resolve(BASE_URI, uri);
            }).get();
            Promise.all(posts_links.map((uri) => ingest_article(hatch, uri))).then(() => {
                return hatch.finish();
            }).catch((err) => console.log(err));
        });
    });
}

main();