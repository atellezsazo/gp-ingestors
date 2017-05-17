'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const Promise = require('bluebird');
const template = require('./template');
const url = require('url');
const base_uri = "http://dianarikasari.blogspot.com";

// Remove elements (body)
const remove_elements = [
    'iframe',
    'noscript',
    'script',
    'style'
];

// clean attr (tag)
const remove_attr = [
    'class',
    'height',
    'id',
    'sizes',
    'src',
    'srcset',
    'style',
    'width'
];

// embed video
const video_iframes = [
    'youtube',
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const post = $profile('.date-outer').map(function() { 
            const date_published = new Date(Date.parse($profile(this).find('.date-header span').text()));
            const title = $profile(this).find('.post-title').text();

            // download videos
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
                let body = $profile(this).find('.post-body').first();
                
                const category = $profile(this).find('.post-labels a').map(function() {
                    return $profile(this);
                }).get();       

                const section = $profile(this).find('.post-labels').text().replace('Labels:', '');

                // Set title section
                asset.set_title(title);
                asset.set_canonical_uri(uri);
                asset.set_last_modified_date(date_published);
                asset.set_synopsis(body.text().substring(0, 140));
                asset.set_section(section);

                // Download images
                let isFirst = true;
                $profile(this).find('.post-body img').map(function() {
                    if (this.attribs.src) {
                        const image = libingester.util.download_img(this, base_uri);
                        image.set_title(title);
                        hatch.save_asset(image);

                        if (isFirst) {
                            asset.set_thumbnail(image);
                            isFirst = false;
                        }

                        this.attribs['data-libingester-asset-id'] = image.asset_id;
                        for (const attr of remove_attr) {
                            delete this.attribs[attr];
                        }
                    }
                });

                // remove elements (body)
                for (const remove_element of remove_elements) {
                    $profile(this).find(remove_element).remove();
                }

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
                return asset;
            }
        }).get();
    }).catch((err) => {
        console.log(err);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    const posts = new Promise((resolve, reject) => {
        libingester.util.fetch_html(base_uri).then(($posts) => {
            const posts_links = $posts('.post-title a').map(function() {
                const uri = $posts(this).attr('href');
                return url.resolve(base_uri, uri);
            }).get();
            Promise.all(posts_links.map((uri) => ingest_article(hatch, uri))).then(() => {
                resolve(true);
            });
        });
    });

    Promise.all([posts]).then(values => {
        return hatch.finish();
    });
}

main();
